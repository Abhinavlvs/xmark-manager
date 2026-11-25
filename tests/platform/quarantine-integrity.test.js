import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/platform/local-store.js';
import { fakeArea } from '../../test-support/storage-area.js';

const DOC = 'xmark.doc';
const INDEX = 'xmark.doc.status';
const copy = (n) => `xmark.doc.quarantine.${n}`;
const AT = '2026-11-21T10:00:00.000Z';
const empty = { version: 1, folders: [], posts: [] };
const store = (area) => createLocalStore(area, { now: () => AT });
const idOf = async (s, n) => (await s.status()).copies.find((c) => c.n === n)?.id;
const refused = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e.code;
  }
};

test('clear without keeping copies forgets what it knew: the same raw value is refused again', async () => {
  const area = fakeArea({ [DOC]: '{bad-K' });
  const s = store(area);
  await s.load();
  await s.clear({ keepCopy: false });
  area.data[DOC] = '{bad-K';
  assert.equal(await refused(s.save(empty)), 'storage_unreadable');
  assert.equal(area.data[DOC], '{bad-K');
});

test('a copy discarded by another store instance is no longer trusted by the first', async () => {
  const area = fakeArea({ [DOC]: '{bad-Z' });
  const a = store(area);
  await a.load();
  const other = store(area);
  await other.discardQuarantine(1, await idOf(other, 1));
  assert.equal(await refused(a.save(empty)), 'storage_unreadable');
  assert.equal(area.data[DOC], '{bad-Z');
});

test('a lost index does not make the next copy overwrite a surviving copy', async () => {
  const area = fakeArea({ [DOC]: '{bad-X' });
  await store(area).load();
  delete area.data[INDEX];
  area.data[DOC] = '{bad-Y';
  const s = store(area);
  await s.load();
  assert.equal(area.data[copy(1)], '{bad-X');
  assert.equal(area.data[copy(2)], '{bad-Y');
  assert.deepEqual(
    (await s.status()).copies.map((c) => c.n),
    [1, 2],
  );
});

test('an orphan copy is listed, exportable and discardable', async () => {
  const area = fakeArea({ [DOC]: '{bad-X' });
  await store(area).load();
  delete area.data[INDEX];
  const s = store(area);
  assert.deepEqual(
    (await s.status()).copies.map((c) => c.n),
    [1],
  );
  assert.equal(await s.exportQuarantine(1, await idOf(s, 1)), '{bad-X');
  await s.discardQuarantine(1, await idOf(s, 1));
  assert.equal(copy(1) in area.data, false);
});

test('an index entry whose copy key is gone is dropped, not duplicated', async () => {
  const area = fakeArea({ [DOC]: '{bad-X' });
  const s = store(area);
  await s.load();
  delete area.data[copy(1)];
  await s.load();
  assert.equal(area.data[copy(1)], '{bad-X');
  assert.deepEqual(
    area.data[INDEX].copies.map((c) => c.n),
    [1],
  );
});

test('two store instances loading different unreadable values never share a copy number', async () => {
  const area = fakeArea({ [DOC]: '{c1' });
  const a = store(area);
  const b = store(area);
  const p1 = a.load();
  area.data[DOC] = '{c2';
  const p2 = b.load();
  await Promise.all([p1, p2]);
  assert.deepEqual([area.data[copy(1)], area.data[copy(2)]].sort(), ['{c1', '{c2']);
});

test('the current unreadable value can be exported even when five copies are full', async () => {
  const area = fakeArea({ [DOC]: 'v1' });
  const s = store(area);
  for (const v of ['v2', 'v3', 'v4', 'v5', 'v6']) {
    await s.load().catch(() => {});
    area.data[DOC] = v;
  }
  assert.equal(await s.exportQuarantine(), 'v5', 'the default export is the newest copy');
  assert.equal(await s.exportCurrentUnreadable(), 'v6');
  area.data[DOC] = empty;
  assert.equal(await s.exportCurrentUnreadable(), null, 'a readable library has nothing to export');
});
