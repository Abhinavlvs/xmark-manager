import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/background/app.js';
import { createLocalStore } from '../../src/platform/local-store.js';
import { createRepository } from '../../src/core/repository.js';
import { normalizeDocument } from '../../src/core/model.js';
import { sequentialIds } from '../../test-support/fakes.js';
import { fakeArea } from '../../test-support/storage-area.js';
import { MSG } from '../../src/platform/messages.js';

const ID = 'ext@id';
const popup = { id: ID, url: 'moz-extension://abc/popup.html' };
const DAY = 24 * 3600 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

const syntheticPost = (n) => ({
  id: `id-${n}`,
  url: `https://x.com/user_${n % 500}/status/${1_700_000_000_000_000_000n + BigInt(n)}`,
  author: `user_${n % 500}`,
  text_preview:
    n % 3 === 0 ? 'A short post text snippet that is about eighty characters long, ok.' : '',
  folder_id: n % 7 === 0 ? 'f1' : null,
  tags: n % 2 === 0 ? ['alpha', 'beta'] : [],
  notes: n % 5 === 0 ? 'A note the user wrote for this post.' : '',
  created_at: ago(300 - (n % 200)),
  updated_at: ago(100 - (n % 90)),
  deleted: false,
});
const sortById = (list) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
const normalized = (doc) => {
  const { folders, posts } = normalizeDocument(doc).doc;
  return { folders: sortById(folders), posts: sortById(posts) };
};

test('export, delete all, import restores every post, folder, tag, note and timestamp exactly', async () => {
  const folders = [
    { id: 'f1', name: 'Reading', updated_at: ago(20), deleted: false },
    { id: 'f2', name: 'Old', updated_at: ago(5), deleted: true },
  ];
  const posts = [
    { ...syntheticPost(1), folder_id: 'f1', tags: ['a', 'b'], notes: 'note', text_preview: 'hi' },
    {
      ...syntheticPost(4),
      folder_id: 'ghost-folder',
      notes: 'caf\u00e9 \u2028 line sep \u{1F600} \u0000end',
      tags: ['\u00fcber', '\u65e5\u672c'],
    },
    { ...syntheticPost(2), url: 'https://x.com/i/web/status/99', author: null },
    {
      ...syntheticPost(3),
      deleted: true,
      notes: '',
      tags: [],
      text_preview: '',
      updated_at: ago(3),
    },
  ];
  const area = fakeArea({ 'xmark.doc': { version: 1, folders, posts } });
  const app = buildApp({
    browserApi: {
      storage: { local: area },
      runtime: { id: ID, getURL: () => 'moz-extension://abc/' },
    },
  });
  const send = (type, payload) => app({ type, payload }, popup);
  const exported = (await send(MSG.EXPORT_DATA)).data;
  const before = normalized(JSON.parse(exported));
  assert.equal((await send(MSG.DELETE_ALL_DATA)).ok, true);
  assert.deepEqual((await send(MSG.LIST_POSTS)).data, []);
  const res = await send(MSG.IMPORT_DATA, { text: exported });
  assert.equal(res.ok, true);
  assert.equal(res.data.added, 3);
  const after = normalized(JSON.parse((await send(MSG.EXPORT_DATA)).data));
  assert.deepEqual(after, before);
  const orphan = after.posts.find((p) => p.id === 'id-4');
  assert.equal(orphan.folder_id, 'ghost-folder', 'an orphan folder id survives the round trip');
  assert.match(orphan.notes, /\u2028/);
  assert.equal(after.posts.filter((p) => p.deleted).length, 1, 'the tombstone survives');
  assert.deepEqual(after, normalized({ version: 1, folders, posts }));
});

/**
 * Scale check, 10,000 posts (measured on an Apple-silicon laptop, Node 20, fake storage area
 * that structured-clones like the real one; the real Firefox adds IO, so treat as a floor):
 *   serialized library  ~ 2.8 MB   (2,829,904 bytes, about 283 bytes per post)
 *   savePost latency    ~ 100 ms median, 105-140 ms worst of 10 (includes the save-time re-check of the stored value) (load + clone + upsert + save of the whole document)
 * The thresholds below are deliberately generous so a slow CI box does not flake; they exist
 * to catch an accidental O(n^2) or similar slowdown, not to pin the numbers.
 */
test('a 10,000-post library stays small and a single save stays fast', async () => {
  const doc = {
    version: 1,
    folders: [],
    posts: Array.from({ length: 10_000 }, (_, n) => syntheticPost(n)),
  };
  const bytes = JSON.stringify(doc).length;
  const area = fakeArea({ 'xmark.doc': doc });
  const repo = createRepository({
    store: createLocalStore(area),
    clock: { now: () => new Date().toISOString() },
    createId: sequentialIds('new-'),
  });
  await repo.savePost({ url: 'https://x.com/warm/status/1' });
  const times = [];
  for (let n = 0; n < 10; n += 1) {
    const start = performance.now();
    await repo.savePost({ url: `https://x.com/bench/status/${2 + n}`, notes: 'n' });
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(
    `# 10k posts: ${bytes} bytes serialized, savePost median ${median.toFixed(1)} ms, max ${times.at(-1).toFixed(1)} ms`,
  );
  assert.ok(bytes < 5 * 1024 * 1024, `library is ${bytes} bytes`);
  assert.ok(median < 500, `savePost median ${median} ms`);
  assert.equal((await repo.listPosts()).length, 10_011);
});
