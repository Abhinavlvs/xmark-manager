import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../src/platform/local-store.js';
import { createRepository } from '../../src/core/repository.js';
import { emptyDocument } from '../../src/core/model.js';
import { fakeArea } from '../../test-support/storage-area.js';
import { fixedClock, sequentialIds } from '../../test-support/fakes.js';

test('load on empty area returns an empty document', async () => {
  assert.deepEqual(await createLocalStore(fakeArea()).load(), emptyDocument());
});

test('load on corrupt data returns an empty document without throwing', async () => {
  for (const bad of ['junk', 42, null, { version: 9 }, { version: 1, posts: 'x', folders: [] }]) {
    const store = createLocalStore(fakeArea({ 'xmark.doc': bad }));
    assert.deepEqual(await store.load(), emptyDocument());
  }
});

test('save then load round-trips', async () => {
  const store = createLocalStore(fakeArea());
  const doc = {
    version: 1,
    folders: [{ id: 'f1', name: 'A', updated_at: '2026-01-01T00:00:00.000Z', deleted: false }],
    posts: [],
  };
  await store.save(doc);
  assert.deepEqual(await store.load(), doc);
});

test('clear removes the document', async () => {
  const area = fakeArea();
  const store = createLocalStore(area);
  await store.save({ ...emptyDocument(), folders: [] });
  await store.clear();
  assert.equal('xmark.doc' in area.data, false);
});

test('app starts with an empty library after the stored doc is corrupted', async () => {
  const area = fakeArea();
  const store = createLocalStore(area);
  const repo = createRepository({
    store,
    clock: fixedClock('2026-01-01T00:00:00.000Z'),
    createId: sequentialIds(),
  });
  await repo.createFolder('Work');
  assert.equal((await repo.listFolders()).length, 1);
  area.data['xmark.doc'] = '{corrupt';
  assert.deepEqual(await repo.listFolders(), []);
  assert.deepEqual(await repo.listPosts(), []);
});
