import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore } from '../../src/platform/settings-store.js';
import { fakeArea } from '../../test-support/storage-area.js';

test('snippetLength defaults to 280 and is stored with the other settings', async () => {
  const s = createSettingsStore(fakeArea());
  assert.deepEqual(await s.get(), { saveSnippets: false, snippetLength: 280 });
  assert.deepEqual(await s.set({ snippetLength: 60 }), { saveSnippets: false, snippetLength: 60 });
  assert.deepEqual(await s.set({ saveSnippets: true }), { saveSnippets: true, snippetLength: 60 });
});

test('set coerces numbers and ignores non-numbers; reads coerce junk', async () => {
  const table = [
    [35, 35],
    [36, 36],
    [280, 280],
    [281, 280],
    [34, 35],
    [0, 35],
    [-1, 35],
    [140.6, 141],
    [NaN, 280],
    [Infinity, 280],
  ];
  for (const [input, expected] of table) {
    const s = createSettingsStore(fakeArea());
    assert.equal((await s.set({ snippetLength: input })).snippetLength, expected, String(input));
  }
  const s = createSettingsStore(fakeArea());
  await s.set({ snippetLength: 60 });
  assert.equal((await s.set({ snippetLength: '200' })).snippetLength, 60);
  assert.equal((await s.set({ snippetLength: null })).snippetLength, 60);
  for (const junk of ['200', null, NaN, 9999, -4]) {
    const stored = createSettingsStore(
      fakeArea({ 'xmark.settings': { saveSnippets: true, snippetLength: junk } }),
    );
    const got = (await stored.get()).snippetLength;
    assert.ok(got >= 35 && got <= 280 && Number.isInteger(got), String(junk));
  }
});

test('an old stored value without snippetLength reads as 280; clear resets it', async () => {
  const area = fakeArea({ 'xmark.settings': { saveSnippets: true } });
  const s = createSettingsStore(area);
  assert.deepEqual(await s.get(), { saveSnippets: true, snippetLength: 280 });
  await s.set({ snippetLength: 200 });
  await s.clear();
  assert.deepEqual(await s.get(), { saveSnippets: false, snippetLength: 280 });
});
