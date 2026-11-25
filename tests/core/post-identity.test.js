import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusIdOf, collapseLive } from '../../src/core/post-identity.js';
import { mergeDocuments, TOMBSTONE_TTL_MS } from '../../src/core/merge.js';
import { parseImport } from '../../src/core/portability.js';
import { createRepository } from '../../src/core/repository.js';
import { emptyDocument } from '../../src/core/model.js';
import { sequentialIds } from '../../test-support/fakes.js';
import { memoryStore } from '../../test-support/memory-store.js';

const T1 = '2026-05-01T00:00:00.000Z';
const T2 = '2026-05-02T00:00:00.000Z';
const T3 = '2026-05-03T00:00:00.000Z';
const NOW = '2026-06-01T00:00:00.000Z';
const post = (id, url, over = {}) => ({
  id,
  url,
  author: url.includes('/i/web/') ? null : url.split('/')[3],
  text_preview: '',
  folder_id: null,
  tags: [],
  notes: '',
  created_at: T1,
  updated_at: T1,
  deleted: false,
  ...over,
});
const doc = (posts) => ({ version: 1, folders: [], posts });
const OPTS = { now: NOW, tombstoneTtlMs: TOMBSTONE_TTL_MS };
const VARIANTS = [
  'https://x.com/Alice/status/1',
  'https://twitter.com/alice/status/1',
  'https://mobile.twitter.com/alice/status/1',
  'https://x.com/i/web/status/1',
];

test('statusIdOf reads the id from every host and form, null for non-posts', () => {
  for (const url of VARIANTS) assert.equal(statusIdOf(url), '1', url);
  assert.equal(statusIdOf('https://x.com/home'), null);
  assert.equal(statusIdOf('nope'), null);
});

test('merge keeps ONE live post for one status id, with the newest handle casing', () => {
  const local = doc([post('a', VARIANTS[0], { updated_at: T1 })]);
  const remote = doc([
    post('b', 'https://x.com/alice/status/1', { updated_at: T3 }),
    post('c', VARIANTS[3], { updated_at: T2 }),
    post('d', VARIANTS[1], { updated_at: T1 }),
  ]);
  for (const merged of [mergeDocuments(local, remote, OPTS), mergeDocuments(remote, local, OPTS)]) {
    const live = merged.posts.filter((p) => !p.deleted);
    assert.equal(live.length, 1);
    assert.equal(live[0].id, 'b');
    assert.equal(live[0].url, 'https://x.com/alice/status/1');
    assert.equal(merged.posts.filter((p) => p.deleted).length, 3);
  }
});

test('the newest record that knows a handle wins, even over a newer /i/web duplicate', () => {
  const { winners, losers } = collapseLive([
    post('a', VARIANTS[3], { updated_at: T3 }),
    post('b', VARIANTS[0], { updated_at: T2 }),
    post('c', VARIANTS[1], { updated_at: T1 }),
  ]);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].id, 'b');
  assert.equal(winners[0].url, 'https://x.com/Alice/status/1');
  assert.deepEqual(losers.map((p) => p.id).sort(), ['a', 'c']);
  const order = collapseLive([
    post('c', VARIANTS[1], { updated_at: T1 }),
    post('b', VARIANTS[0], { updated_at: T2 }),
    post('a', VARIANTS[3], { updated_at: T3 }),
  ]);
  assert.equal(order.winners[0].id, 'b', 'independent of input order');
  const onlyWeb = collapseLive([
    post('x', VARIANTS[3], { updated_at: T1 }),
    post('y', 'https://x.com/i/web/status/1', { updated_at: T2 }),
  ]);
  assert.equal(onlyWeb.winners[0].id, 'y');
});

test('merge is still idempotent and commutative with identity collapsing', () => {
  const a = doc([post('a', VARIANTS[0]), post('x', VARIANTS[3], { updated_at: T2 })]);
  const b = doc([post('b', VARIANTS[1], { updated_at: T3 })]);
  const ab = mergeDocuments(a, b, OPTS);
  assert.deepEqual(mergeDocuments(b, a, OPTS), ab);
  assert.deepEqual(mergeDocuments(ab, ab, OPTS), ab);
});

test('import collapses variants of one status inside a file and counts them as merged', () => {
  const res = parseImport(
    JSON.stringify(
      doc([
        post('a', 'https://x.com/Alice/status/1', { updated_at: T1 }),
        post('b', 'https://twitter.com/alice/status/1', { updated_at: T2 }),
        post('c', VARIANTS[3], { updated_at: T3 }),
      ]),
    ),
  );
  assert.equal(res.doc.posts.length, 1);
  assert.equal(res.merged, 2);
  assert.equal(res.doc.posts[0].url, 'https://x.com/alice/status/1');
});

test('upsert treats every variant as the same post and keeps the latest handle casing', async () => {
  const store = memoryStore(emptyDocument());
  const repo = createRepository({ store, clock: { now: () => T1 }, createId: sequentialIds() });
  const first = await repo.savePost({ url: VARIANTS[3], notes: 'one' });
  for (const url of [VARIANTS[0], VARIANTS[1], VARIANTS[2]]) await repo.savePost({ url });
  const posts = await repo.listPosts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, first.id);
  assert.equal(posts[0].url, 'https://x.com/alice/status/1');
  assert.equal(posts[0].notes, 'one');
  await repo.savePost({ url: VARIANTS[3] });
  assert.equal((await repo.listPosts())[0].url, 'https://x.com/alice/status/1', 'no handle loss');
});
