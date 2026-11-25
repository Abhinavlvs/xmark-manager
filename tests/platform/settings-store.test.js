import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore } from '../../src/platform/settings-store.js';
import { fakeArea } from '../../test-support/storage-area.js';

test('defaults saveSnippets to false', async () => {
  assert.deepEqual(await createSettingsStore(fakeArea()).get(), {
    saveSnippets: false,
    snippetLength: 280,
  });
});

test('junk stored values coerce to defaults', async () => {
  for (const bad of ['x', 5, null, { saveSnippets: 'yes' }, { saveSnippets: 1 }]) {
    const s = createSettingsStore(fakeArea({ 'xmark.settings': bad }));
    assert.deepEqual(await s.get(), { saveSnippets: false, snippetLength: 280 });
  }
});

test('set accepts only a boolean saveSnippets (and a numeric snippetLength) and returns new settings', async () => {
  const s = createSettingsStore(fakeArea());
  const on = { saveSnippets: true, snippetLength: 280 };
  assert.deepEqual(await s.set({ saveSnippets: true, token: 'x' }), on);
  assert.deepEqual(await s.get(), on);
  assert.deepEqual(await s.set({ saveSnippets: 'no' }), on);
  assert.deepEqual(await s.set(null), on);
});

test('clear removes stored settings so defaults return', async () => {
  const area = fakeArea({ 'xmark.settings': { saveSnippets: true } });
  const s = createSettingsStore(area);
  await s.clear();
  assert.deepEqual(await s.get(), { saveSnippets: false, snippetLength: 280 });
  assert.equal('xmark.settings' in area.data, false);
});

test('set and clear are serialized: a clear issued after a set always wins', async () => {
  const data = {};
  const slow =
    (fn) =>
    async (...a) => {
      await new Promise((r) => setTimeout(r, 5));
      return fn(...a);
    };
  const area = {
    get: slow(async (k) => (k in data ? { [k]: structuredClone(data[k]) } : {})),
    set: slow(async (o) => void Object.assign(data, structuredClone(o))),
    remove: slow(async (k) => void [].concat(k).forEach((x) => delete data[x])),
  };
  const store = createSettingsStore(area);
  await Promise.all([store.set({ saveSnippets: true }), store.clear()]);
  assert.deepEqual(await store.get(), { saveSnippets: false, snippetLength: 280 });
});

test('a failing write is reported as storage_full or storage_error', async () => {
  const area = {
    get: async () => ({}),
    set: async () => Promise.reject(Object.assign(new Error('x'), { name: 'QuotaExceededError' })),
    remove: async () => {},
  };
  await assert.rejects(
    createSettingsStore(area).set({ saveSnippets: true }),
    (e) => e.code === 'storage_full',
  );
  // the queue stays usable after a failure
  area.set = async () => {};
  assert.deepEqual(await createSettingsStore(area).set({ saveSnippets: true }), {
    saveSnippets: true,
    snippetLength: 280,
  });
});
