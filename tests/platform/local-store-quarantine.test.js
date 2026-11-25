import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/platform/local-store.js';
import { createRepository } from '../../src/core/repository.js';
import { emptyDocument } from '../../src/core/model.js';
import { sequentialIds } from '../../test-support/fakes.js';
import { fakeArea, quotaError } from '../../test-support/storage-area.js';

const DOC = 'xmark.doc';
const FLAG = 'xmark.doc.status';
const copy = (n) => `xmark.doc.quarantine.${n}`;
const AT = '2026-11-21T10:00:00.000Z';
const make = (initial, opts) => {
  const area = fakeArea(initial, opts);
  return { area, store: createLocalStore(area, { now: () => AT }) };
};
const GOOD = {
  id: 'a',
  url: 'https://x.com/a/status/1',
  updated_at: AT,
  created_at: AT,
  deleted: false,
};
const PRECIOUS = { id: 'b', url: 'https://x.com/a/status/2', tags: 'oops', notes: 'precious' };
const idOf = async (s, n) => (await s.status()).copies.find((c) => c.n === n)?.id;
const copiesOf = (area) => Object.keys(area.data).filter((k) => k.startsWith(`${copy('')}`));

test('unreadable text is copied to copy 1 and indexed in one set; load returns empty', async () => {
  const { area, store } = make({ [DOC]: '{corrupt' });
  assert.deepEqual(await store.load(), emptyDocument());
  assert.equal(area.sets, 1, 'copy and index in a single set');
  assert.equal(area.data[copy(1)], '{corrupt');
  const { id, ...rest } = area.data[FLAG].copies[0];
  assert.deepEqual(rest, { n: 1, at: AT, reason: 'not_object', bytes: 8 });
  assert.ok(id);
  assert.equal(typeof area.data[FLAG].copies[0].id, 'string');
  assert.equal(area.data[DOC], '{corrupt', 'the original is not touched by load');
});

test('a missing document is empty and creates nothing', async () => {
  const { area, store } = make();
  assert.deepEqual(await store.load(), emptyDocument());
  assert.deepEqual(Object.keys(area.data), []);
  assert.deepEqual(await store.status(), { state: 'ok' });
});

test('an unknown FUTURE version is copied whole and never downgraded', async () => {
  const future = { version: 2, folders: [], posts: [{ id: 'a', brandNew: true }] };
  const { area, store } = make({ [DOC]: future });
  assert.deepEqual(await store.load(), emptyDocument());
  assert.deepEqual(area.data[copy(1)], future);
  assert.equal(area.data[FLAG].copies[0].reason, 'unknown_version');
});

test('a missing version with valid records loads as v1 without a copy', async () => {
  const folder = { id: 'f', name: 'A', updated_at: AT, deleted: false };
  const { area, store } = make({ [DOC]: { folders: [folder], posts: [] } });
  assert.equal((await store.load()).folders.length, 1);
  assert.deepEqual(copiesOf(area), []);
});

test('the same raw value is never copied twice', async () => {
  const { area, store } = make({ [DOC]: 'same' });
  await store.load();
  await store.load();
  await createLocalStore(area, { now: () => AT }).load(); // a restart: new instance, same area
  assert.equal(area.sets, 1);
  assert.deepEqual(copiesOf(area), [copy(1)]);
});

test('two different corruptions in sequence keep BOTH copies', async () => {
  const { area, store } = make({ [DOC]: 'first' });
  await store.load();
  area.data[DOC] = 'second';
  await store.load();
  assert.equal(area.data[copy(1)], 'first');
  assert.equal(area.data[copy(2)], 'second');
  assert.deepEqual(
    area.data[FLAG].copies.map((c) => c.n),
    [1, 2],
  );
  assert.equal(await store.exportQuarantine(), 'second', 'default is the newest');
  assert.equal(await store.exportQuarantine(1, await idOf(store, 1)), 'first');
  await assert.rejects(store.exportQuarantine(9, 'x'), (e) => e.code === 'copy_changed');
});

test('a 6th distinct unreadable value is not written and saving is refused until a copy is discarded', async () => {
  const { area, store } = make({ [DOC]: 'v1' });
  for (const v of ['v2', 'v3', 'v4', 'v5']) {
    await store.load();
    area.data[DOC] = v;
  }
  await store.load();
  assert.equal(copiesOf(area).length, 5);
  area.data[DOC] = 'v6';
  await assert.rejects(store.load(), (e) => e.code === 'storage_unreadable');
  await assert.rejects(store.save(emptyDocument()), (e) => e.code === 'storage_unreadable');
  assert.equal(area.data[DOC], 'v6', 'nothing was overwritten');
  assert.equal(copiesOf(area).length, 5, 'no copy was silently dropped');
  const status = await store.status();
  assert.equal(status.state, 'storage_unreadable');
  assert.equal(status.copies.length, 5);
  assert.equal(
    await store.exportQuarantine(1, await idOf(store, 1)),
    'v1',
    'export works in this state',
  );
  await store.discardQuarantine(1, await idOf(store, 1));
  await store.load();
  assert.equal(area.data[copy(1)], 'v6', 'the freed number is reused');
  await store.save(emptyDocument());
  assert.deepEqual(area.data[DOC], emptyDocument());
});

test('the first save after a copy keeps every copy', async () => {
  const { area, store } = make({ [DOC]: '{corrupt' });
  await store.load();
  await store.save(emptyDocument());
  assert.equal(area.data[copy(1)], '{corrupt');
  assert.equal(area.data[FLAG].copies.length, 1);
  assert.deepEqual(await store.load(), emptyDocument());
});

test('save refuses to overwrite an unreadable library that has no copy of exactly that value', async () => {
  const { area, store } = make({ [DOC]: 'junk' });
  await assert.rejects(store.save(emptyDocument()), (e) => e.code === 'storage_unreadable');
  assert.equal(area.data[DOC], 'junk');
  await store.load();
  await store.save(emptyDocument());
  assert.deepEqual(area.data[DOC], emptyDocument());
});

test('probe 8: a library that turns into a v2 value after a dropped record is still kept', async () => {
  const { area, store } = make({ [DOC]: { version: 1, folders: [], posts: [GOOD, PRECIOUS] } });
  const repo = createRepository({
    store,
    clock: { now: () => AT },
    createId: sequentialIds(),
  });
  assert.equal((await repo.listPosts()).length, 1);
  area.data[DOC] = 'V2-ONLY-WORK';
  await repo.savePost({ url: 'https://x.com/a/status/3' });
  const kept = copiesOf(area).map((k) => area.data[k]);
  assert.ok(kept.includes('V2-ONLY-WORK'), 'the V2 value lives on in a copy');
  assert.ok(kept.some((v) => JSON.stringify(v).includes('precious')));
});

test('probe 10: a failed copy write refuses the save, even after discard', async () => {
  const { area, store } = make({ [DOC]: 'junk' }, { failSet: quotaError(), failOnce: true });
  await assert.rejects(store.load(), (e) => e.code === 'storage_unreadable');
  assert.deepEqual(await store.status().then((s) => s.state), 'quarantined', 'next try succeeds');
  area.data[DOC] = 'junk2';
  area.state.failSet = quotaError();
  await assert.rejects(store.load(), (e) => e.code === 'storage_unreadable');
  await store.discardQuarantine();
  await assert.rejects(store.save(emptyDocument()), (e) => e.code === 'storage_unreadable');
  assert.equal(area.data[DOC], 'junk2', 'the data was not lost');
});

test('export and discard work with no copy, with copies, and without loading the library', async () => {
  const { area, store } = make({ [DOC]: 'junk' }, { failSet: quotaError() });
  assert.deepEqual(await store.status(), { state: 'storage_unreadable', copies: [] });
  assert.equal(await store.exportQuarantine(), 'junk', 'falls back to the unreadable value');
  await store.discardQuarantine();
  assert.equal(area.data[DOC], 'junk');
  area.state.failSet = null;
  await store.load();
  assert.equal(await store.exportQuarantine(), 'junk');
});

test('discard removes only copies and the index, never the library; a still-unreadable value is re-copied', async () => {
  const { area, store } = make({ [DOC]: 'junk' });
  await store.load();
  await store.discardQuarantine();
  assert.deepEqual(copiesOf(area), []);
  assert.equal(FLAG in area.data, false);
  assert.equal(area.data[DOC], 'junk');
  await store.load();
  assert.equal(area.data[copy(1)], 'junk', 'discarding can never cause loss');
  await store.discardQuarantine(1, await idOf(store, 1));
  assert.equal(area.data[DOC], 'junk');
});

test('discarding one of two copies by number keeps the other and the index in step', async () => {
  const { area, store } = make({ [DOC]: 'a' });
  await store.load();
  area.data[DOC] = 'b';
  await store.load();
  await store.discardQuarantine(1, await idOf(store, 1));
  assert.deepEqual(copiesOf(area), [copy(2)]);
  assert.deepEqual(
    area.data[FLAG].copies.map((c) => c.n),
    [2],
  );
});

test('dropped records: usable library, the whole raw value copied first, and unversioned is consistent', async () => {
  for (const version of [1, undefined]) {
    const raw = { ...(version ? { version } : {}), folders: [], posts: [GOOD, PRECIOUS] };
    const { area, store } = make({ [DOC]: raw });
    const doc = await store.load();
    if (version)
      assert.deepEqual(
        doc.posts.map((p) => p.id),
        ['a'],
      );
    else assert.deepEqual(doc.posts, []);
    assert.deepEqual(area.data[copy(1)], raw);
    if (version) {
      assert.equal(area.data[FLAG].copies[0].reason, 'records_dropped');
      assert.equal(area.data[FLAG].copies[0].dropped, 1);
    }
    await store.save(doc);
    assert.deepEqual(area.data[copy(1)], raw, 'the copy survives the first save');
    assert.match(await store.exportQuarantine(), /precious/);
  }
});

test('a restart (new store over the same area) sees the same copies and status', async () => {
  const { area, store } = make({ [DOC]: 'x' });
  await store.load();
  area.data[DOC] = 'y';
  await store.load();
  const before = await store.status();
  const again = createLocalStore(area, { now: () => 'later' });
  assert.deepEqual(await again.status(), before);
  assert.equal(await again.exportQuarantine(1, await idOf(again, 1)), 'x');
  assert.equal(area.sets, 2, 'nothing was copied again');
});

test('clear can keep the copies', async () => {
  const { area, store } = make({ [DOC]: 'junk' });
  await store.load();
  await store.clear({ keepCopy: true });
  assert.equal(DOC in area.data, false);
  assert.equal(area.data[copy(1)], 'junk');
  assert.equal((await store.status()).state, 'quarantined');
  await store.clear();
  assert.deepEqual(Object.keys(area.data), []);
});

test('a failing save is reported as storage_full or storage_error', async () => {
  const { area, store } = make();
  area.state.failSet = quotaError();
  await assert.rejects(store.save(emptyDocument()), (e) => e.code === 'storage_full');
  area.state.failSet = new Error('disk gone');
  await assert.rejects(store.save(emptyDocument()), (e) => e.code === 'storage_error');
  area.state.failSet = Object.assign(new Error('The quota has been exceeded'), { name: 'Error' });
  await assert.rejects(store.save(emptyDocument()), (e) => e.code === 'storage_full');
});

test('a failing read is reported as storage_read_error', async () => {
  const area = { ...fakeArea(), get: async () => Promise.reject(new Error('boom')) };
  await assert.rejects(createLocalStore(area).load(), (e) => e.code === 'storage_read_error');
});
