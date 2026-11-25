import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/platform/local-store.js';
import { createQuarantine } from '../../src/platform/quarantine.js';
import { fakeArea } from '../../test-support/storage-area.js';

const DOC = 'xmark.doc';
const INDEX = 'xmark.doc.status';
const copy = (n) => `xmark.doc.quarantine.${n}`;
const AT = '2026-11-21T10:00:00.000Z';
const store = (area) => createLocalStore(area, { now: () => AT });
const code = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e.code;
  }
};
async function twoCopies() {
  const area = fakeArea({ [DOC]: '{A' });
  const s = store(area);
  await s.load();
  area.data[DOC] = '{B';
  await s.load();
  return { area, s };
}

test('a stale discard of a number that was reused is refused and removes nothing', async () => {
  const { area, s } = await twoCopies();
  const old = (await s.status()).copies[1];
  await s.discardQuarantine(2, old.id);
  area.data[DOC] = '{C-new';
  await s.load();
  const fresh = (await s.status()).copies.find((c) => c.n === 2);
  assert.notEqual(fresh.id, old.id);
  assert.equal(await code(s.discardQuarantine(2, old.id)), 'copy_changed');
  assert.equal(area.data[copy(2)], '{C-new');
  assert.deepEqual((await s.status()).copies.map((c) => c.id).includes(fresh.id), true);
});

test('a stale export of a reused number is refused instead of exporting other bytes', async () => {
  const { area, s } = await twoCopies();
  const old = (await s.status()).copies[1];
  await s.discardQuarantine(2, old.id);
  area.data[DOC] = '{C-new';
  await s.load();
  assert.equal(await code(s.exportQuarantine(2, old.id)), 'copy_changed');
  const fresh = (await s.status()).copies.find((c) => c.n === 2);
  assert.equal(await s.exportQuarantine(2, fresh.id), '{C-new');
});

test('copies made at the same instant get different ids', async () => {
  const { s } = await twoCopies();
  const ids = (await s.status()).copies.map((c) => c.id);
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every((id) => typeof id === 'string' && id.length >= 8));
});

test('legacy index entries without an id get one, and stay usable', async () => {
  const area = fakeArea({
    [DOC]: '{A',
    'xmark.doc.quarantine.1': '{A',
    [INDEX]: {
      state: 'quarantined',
      at: AT,
      reason: 'not_object',
      copies: [{ n: 1, at: AT, reason: 'not_object', bytes: 2 }],
    },
  });
  const s = store(area);
  const [entry] = (await s.status()).copies;
  assert.equal(typeof entry.id, 'string');
  assert.equal(area.data[INDEX].copies[0].id, entry.id, 'persisted');
  assert.equal(await s.exportQuarantine(1, entry.id), '{A');
});

test('a reader that started before a write cannot clobber the index', async () => {
  const area = fakeArea({});
  const q = createQuarantine(area, { now: () => AT, createId: () => `id${Math.random()}` });
  await q.ensure('{A', 'unreadable');
  const orig = area.get.bind(area);
  let release;
  const gate = new Promise((r) => (release = r));
  let first = true;
  area.get = async (k) => {
    const r = await orig(k);
    if (k === INDEX && first) {
      first = false;
      await gate;
    }
    return r;
  };
  const reader = q.list();
  await new Promise((r) => setTimeout(r, 5));
  const writer = q.ensure('{B-dropped', 'partial', 3);
  release();
  await Promise.all([reader, writer]);
  assert.deepEqual(
    area.data[INDEX].copies.map((c) => c.n),
    [1, 2],
  );
  assert.equal(area.data[INDEX].reason, 'partial');
});

test('a stale index with only dangling entries is removed', async () => {
  const area = fakeArea({
    [INDEX]: { state: 'quarantined', copies: [{ n: 1, id: 'x', at: AT, reason: 'r', bytes: 1 }] },
  });
  assert.deepEqual(await store(area).status(), { state: 'ok' });
  assert.equal(INDEX in area.data, false);
});

test('junk index entries never throw and are repaired', async () => {
  for (const copies of [[null], [{ n: 'x' }], [{ n: 1 }, { n: 1 }], [{ n: 9 }], 'nope']) {
    const area = fakeArea({
      [DOC]: '{A',
      [INDEX]: { state: 'quarantined', copies },
      'xmark.doc.quarantine.1': '{A',
    });
    const s = store(area);
    const status = await s.status();
    assert.deepEqual(
      status.copies.map((c) => c.n),
      [1],
      JSON.stringify(copies),
    );
    await s.discardQuarantine(1, status.copies[0].id);
  }
});

test('more than five junk entries are capped at five', async () => {
  const data = { [DOC]: '{A', [INDEX]: { copies: [] } };
  for (let n = 1; n <= 8; n += 1) data[copy(n)] = `v${n}`;
  const s = store(fakeArea(data));
  assert.equal((await s.status()).copies.length, 5);
});

test('old monotonic keys beyond five are re-adopted and delete-all removes every prefixed key', async () => {
  const area = fakeArea({
    [DOC]: { version: 1, folders: [], posts: [] },
    [copy(7)]: 'old7',
    [copy(8)]: 'old8',
    [copy(30)]: 'old30',
  });
  const s = store(area);
  assert.deepEqual(
    (await s.status()).copies.map((c) => c.n),
    [7, 8],
  );
  await s.clear({ keepCopy: false });
  assert.deepEqual(Object.keys(area.data), []);
});

test('clear that keeps copies saves the uncopied unreadable value first, or refuses', async () => {
  const area = fakeArea({ [DOC]: '{lonely' });
  const s = store(area);
  await s.clear({ keepCopy: true });
  assert.equal(DOC in area.data, false);
  assert.equal(area.data[copy(1)], '{lonely');
  const full = fakeArea({ [DOC]: '{v1' });
  const f = store(full);
  for (const v of ['v2', 'v3', 'v4', 'v5']) {
    await f.load();
    full.data[DOC] = v;
  }
  await f.load();
  full.data[DOC] = '{v6';
  assert.equal(await code(f.clear({ keepCopy: true })), 'storage_unreadable');
  assert.equal(full.data[DOC], '{v6', 'nothing was deleted');
});
