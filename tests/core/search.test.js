import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPosts } from '../../src/core/search.js';

const T = '2026-05-01T00:00:00.000Z';
const post = (over = {}) => ({
  id: 'p1',
  url: 'https://x.com/alice/status/1',
  author: 'alice',
  text_preview: '',
  folder_id: null,
  tags: [],
  notes: '',
  created_at: T,
  updated_at: T,
  deleted: false,
  ...over,
});
const posts = [
  post({ id: 'a', url: 'https://x.com/Alice/status/1', author: 'Alice', folder_id: 'f1' }),
  post({ id: 'b', url: 'https://x.com/bob/status/2', author: 'bob', notes: 'Great THREAD' }),
  post({ id: 'c', url: 'https://x.com/carol/status/3', author: null, tags: ['rust', 'wasm'] }),
  post({ id: 'd', url: 'https://x.com/dan/status/4', author: 'dan', text_preview: 'Hello World' }),
];
const ids = (list) => list.map((p) => p.id);

test('empty or whitespace query matches everything', () => {
  assert.deepEqual(ids(filterPosts(posts, {})), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(filterPosts(posts, { text: '   ' })), ['a', 'b', 'c', 'd']);
});

test('text matches url, author, notes, tags, text_preview case-insensitively', () => {
  assert.deepEqual(ids(filterPosts(posts, { text: 'ALICE' })), ['a']);
  assert.deepEqual(ids(filterPosts(posts, { text: 'status/2' })), ['b']);
  assert.deepEqual(ids(filterPosts(posts, { text: 'thread' })), ['b']);
  assert.deepEqual(ids(filterPosts(posts, { text: 'WASM' })), ['c']);
  assert.deepEqual(ids(filterPosts(posts, { text: 'hello world' })), ['d']);
  assert.deepEqual(ids(filterPosts(posts, { text: 'nomatch' })), []);
});

test('folderId null means uncategorised only, undefined means any', () => {
  assert.deepEqual(ids(filterPosts(posts, { folderId: null })), ['b', 'c', 'd']);
  assert.deepEqual(ids(filterPosts(posts, { folderId: 'f1' })), ['a']);
  assert.deepEqual(ids(filterPosts(posts, { folderId: undefined })), ['a', 'b', 'c', 'd']);
});

test('tag matches a normalized tag exactly', () => {
  assert.deepEqual(ids(filterPosts(posts, { tag: 'rust' })), ['c']);
  assert.deepEqual(ids(filterPosts(posts, { tag: ' RUST ' })), ['c']);
  assert.deepEqual(ids(filterPosts(posts, { tag: 'rus' })), []);
});

test('criteria combine with AND', () => {
  assert.deepEqual(ids(filterPosts(posts, { text: 'carol', tag: 'rust', folderId: null })), ['c']);
  assert.deepEqual(ids(filterPosts(posts, { text: 'carol', folderId: 'f1' })), []);
});

test('does not mutate input', () => {
  const before = structuredClone(posts);
  const out = filterPosts(posts, { text: 'a' });
  assert.deepEqual(posts, before);
  assert.notEqual(out, posts);
});
