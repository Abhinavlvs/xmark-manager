import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortPosts,
  tagCounts,
  folderCounts,
  adoptOrphans,
  visibleSlice,
  PAGE_SIZE,
} from '../../src/core/post-view.js';

const mk = (id, over = {}) => ({
  id,
  url: `https://x.com/u/status/${id}`,
  author: 'zed',
  folder_id: null,
  tags: [],
  notes: '',
  text_preview: '',
  created_at: '2025-01-01T00:00:00.000Z',
  ...over,
});

test('sortPosts newest first is the default and does not mutate', () => {
  const input = [
    mk('a', { created_at: '2025-01-01T00:00:00.000Z' }),
    mk('b', { created_at: '2025-03-01T00:00:00.000Z' }),
    mk('c', { created_at: '2025-02-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    sortPosts(input).map((p) => p.id),
    ['b', 'c', 'a'],
  );
  assert.deepEqual(
    input.map((p) => p.id),
    ['a', 'b', 'c'],
  );
});

test('sortPosts oldest first', () => {
  const input = [
    mk('a', { created_at: '2025-03-01T00:00:00.000Z' }),
    mk('b', { created_at: '2025-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    sortPosts(input, 'oldest').map((p) => p.id),
    ['b', 'a'],
  );
});

test('sortPosts author A to Z is case-insensitive, missing authors last, ties newest first', () => {
  const input = [
    mk('1', { author: 'bob' }),
    mk('2', { author: null }),
    mk('3', { author: 'Alice', created_at: '2025-01-01T00:00:00.000Z' }),
    mk('4', { author: 'alice', created_at: '2025-02-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    sortPosts(input, 'author').map((p) => p.id),
    ['4', '3', '1', '2'],
  );
});

test('sortPosts falls back to newest for an unknown order', () => {
  const input = [mk('a'), mk('b', { created_at: '2026-01-01T00:00:00.000Z' })];
  assert.equal(sortPosts(input, 'nope')[0].id, 'b');
});

test('tagCounts counts, sorts by count then name', () => {
  const posts = [
    mk('1', { tags: ['b', 'a'] }),
    mk('2', { tags: ['b'] }),
    mk('3', { tags: ['c', 'b'] }),
  ];
  assert.deepEqual(tagCounts(posts), [
    { tag: 'b', count: 3 },
    { tag: 'a', count: 1 },
    { tag: 'c', count: 1 },
  ]);
  assert.deepEqual(tagCounts([]), []);
});

test('folderCounts counts orphan folder ids as uncategorised', () => {
  const folders = [{ id: 'f1', name: 'A' }];
  const posts = [
    mk('1', { folder_id: 'f1' }),
    mk('2', { folder_id: null }),
    mk('3', { folder_id: 'gone' }),
  ];
  const c = folderCounts(posts, folders);
  assert.equal(c.total, 3);
  assert.equal(c.none, 2);
  assert.equal(c.byId.f1, 1);
  assert.equal(c.byId.gone, undefined);
});

test('adoptOrphans rewrites unknown folder ids to null without mutating', () => {
  const folders = [{ id: 'f1', name: 'A' }];
  const posts = [mk('1', { folder_id: 'f1' }), mk('2', { folder_id: 'gone' })];
  const out = adoptOrphans(posts, folders);
  assert.deepEqual(
    out.map((p) => p.folder_id),
    ['f1', null],
  );
  assert.equal(posts[1].folder_id, 'gone');
  assert.equal(out[0], posts[0]);
});

test('visibleSlice shows pages of 50 and reports the remainder', () => {
  const items = Array.from({ length: 120 }, (_, i) => i);
  assert.equal(PAGE_SIZE, 50);
  let s = visibleSlice(items, 1);
  assert.equal(s.items.length, 50);
  assert.equal(s.total, 120);
  assert.equal(s.hasMore, true);
  assert.equal(s.remaining, 70);
  s = visibleSlice(items, 3);
  assert.equal(s.items.length, 120);
  assert.equal(s.hasMore, false);
  assert.equal(s.remaining, 0);
  assert.equal(visibleSlice([], 1).items.length, 0);
});
