import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocuments, TOMBSTONE_TTL_MS } from '../../src/core/merge.js';
import { mergeRecords } from '../../src/core/merge-records.js';

const NOW = '2026-06-01T00:00:00.000Z';
const OPTS = { now: NOW, tombstoneTtlMs: TOMBSTONE_TTL_MS };
const T1 = '2026-05-01T00:00:00.000Z';
const T2 = '2026-05-02T00:00:00.000Z';
const post = (over = {}) => ({
  id: 'p1',
  url: 'https://x.com/a/status/1',
  author: 'a',
  text_preview: '',
  folder_id: null,
  tags: [],
  notes: '',
  created_at: T1,
  updated_at: T1,
  deleted: false,
  ...over,
});
const folder = (over = {}) => ({
  id: 'f1',
  name: 'Reads',
  updated_at: T1,
  deleted: false,
  ...over,
});
const doc = (folders = [], posts = []) => ({ version: 1, folders, posts });
const merge = (a, b) => mergeDocuments(a, b, OPTS);

test('TOMBSTONE_TTL_MS is 90 days', () => {
  assert.equal(TOMBSTONE_TTL_MS, 90 * 24 * 3600 * 1000);
});

test('union of disjoint posts, sorted by id', () => {
  const m = merge(doc([], [post({ id: 'p2', url: 'u2' })]), doc([], [post({ id: 'p1' })]));
  assert.deepEqual(
    m.posts.map((p) => p.id),
    ['p1', 'p2'],
  );
});

test('same id: newer updated_at wins', () => {
  const a = post({ notes: 'old' });
  const b = post({ notes: 'new', updated_at: T2 });
  assert.equal(merge(doc([], [a]), doc([], [b])).posts[0].notes, 'new');
  assert.equal(merge(doc([], [b]), doc([], [a])).posts[0].notes, 'new');
});

test('comparison uses epoch millis, not string order', () => {
  const a = post({ notes: 'a', updated_at: '2026-05-01T00:00:00.000Z' });
  const b = post({ notes: 'b', updated_at: '2026-05-01T00:00:00.001Z' });
  assert.equal(merge(doc([], [a]), doc([], [b])).posts[0].notes, 'b');
});

test('equal updated_at and equal id: larger JSON wins, commutative', () => {
  const a = post({ notes: 'aaa' });
  const b = post({ notes: 'bbb' });
  assert.equal(merge(doc([], [a]), doc([], [b])).posts[0].notes, 'bbb');
  assert.equal(merge(doc([], [b]), doc([], [a])).posts[0].notes, 'bbb');
});

test('mergeRecords keeps distinct ids sorted regardless of order', () => {
  const a = { id: 'a', updated_at: T1, deleted: false };
  const b = { id: 'b', updated_at: T1, deleted: false };
  assert.deepEqual(mergeRecords([b], [a], OPTS), [a, b]);
});

test('tombstone newer than live copy wins', () => {
  const live = post();
  const dead = post({ deleted: true, updated_at: T2 });
  assert.equal(merge(doc([], [live]), doc([], [dead])).posts[0].deleted, true);
});

test('live copy newer than tombstone wins', () => {
  const dead = post({ deleted: true });
  const live = post({ updated_at: T2 });
  assert.equal(merge(doc([], [dead]), doc([], [live])).posts[0].deleted, false);
});

test('tombstone older than 90 days is dropped; recent one kept', () => {
  const old = post({ id: 'old', url: 'u1', deleted: true, updated_at: '2026-01-01T00:00:00.000Z' });
  const recent = post({ id: 'new', url: 'u2', deleted: true, updated_at: T1 });
  const m = merge(doc([], [old, recent]), doc());
  assert.deepEqual(
    m.posts.map((p) => p.id),
    ['new'],
  );
});

test('old live records are never purged', () => {
  const p = post({ updated_at: '2020-01-01T00:00:00.000Z' });
  assert.equal(merge(doc([], [p]), doc()).posts.length, 1);
});

test('far-future updated_at is rewritten to now (posts, folders, tombstones)', () => {
  const far = '2099-01-01T00:00:00.000Z';
  const m = merge(
    doc(
      [folder({ updated_at: far })],
      [post({ updated_at: far }), post({ id: 'p2', url: 'u2', deleted: true, updated_at: far })],
    ),
    doc(),
  );
  assert.equal(m.folders[0].updated_at, NOW);
  assert.deepEqual(
    m.posts.map((p) => p.updated_at),
    [NOW, NOW],
  );
});

test('a genuine edit at now+1s beats a far-future record, either order', () => {
  const evil = post({ notes: 'evil', updated_at: '2099-01-01T00:00:00.000Z' });
  const edit = post({ notes: 'edit', updated_at: '2026-06-01T00:00:01.000Z' });
  assert.equal(merge(doc([], [evil]), doc([], [edit])).posts[0].notes, 'edit');
  assert.equal(merge(doc([], [edit]), doc([], [evil])).posts[0].notes, 'edit');
});

test('a record 1h ahead of now is untouched', () => {
  const p = post({ updated_at: '2026-06-01T01:00:00.000Z' });
  assert.equal(merge(doc([], [p]), doc()).posts[0].updated_at, p.updated_at);
});

test('commutative and idempotent with a far-future record', () => {
  const a = doc([], [post({ notes: 'a', updated_at: '2099-01-01T00:00:00.000Z' })]);
  const b = doc([folder()], [post({ id: 'p2', url: 'u2' })]);
  const m = merge(a, b);
  assert.deepEqual(m, merge(b, a));
  assert.deepEqual(merge(m, m), m);
  assert.deepEqual(merge(m, a), m);
});

test('folders merge the same way', () => {
  const a = folder({ name: 'Old' });
  const b = folder({ name: 'New', updated_at: T2 });
  const c = folder({ id: 'f2', name: 'Other' });
  const m = merge(doc([a, c]), doc([b]));
  assert.deepEqual(
    m.folders.map((f) => [f.id, f.name]),
    [
      ['f1', 'New'],
      ['f2', 'Other'],
    ],
  );
});

test('same url with different live ids: newest kept, other tombstoned at now', () => {
  const a = post({ id: 'pa', notes: 'a' });
  const b = post({ id: 'pb', notes: 'b', updated_at: T2 });
  const m = merge(doc([], [a]), doc([], [b]));
  const byId = Object.fromEntries(m.posts.map((p) => [p.id, p]));
  assert.equal(byId.pb.deleted, false);
  assert.equal(byId.pa.deleted, true);
  assert.equal(byId.pa.updated_at, NOW);
  assert.deepEqual(m, merge(doc([], [b]), doc([], [a])));
});

test('same url, equal time: larger id kept', () => {
  const m = merge(doc([], [post({ id: 'pa' })]), doc([], [post({ id: 'pb' })]));
  assert.deepEqual(
    m.posts.map((p) => [p.id, p.deleted]),
    [
      ['pa', true],
      ['pb', false],
    ],
  );
});

test('tombstoned post with same url does not trigger url dedupe', () => {
  const live = post({ id: 'pa' });
  const dead = post({ id: 'pb', deleted: true, updated_at: T2 });
  const m = merge(doc([], [live]), doc([], [dead]));
  assert.equal(m.posts.find((p) => p.id === 'pa').updated_at, T1);
});

test('post keeps folder_id of a tombstoned or absent folder', () => {
  const p = post({ folder_id: 'gone' });
  const f = folder({ id: 'f9', deleted: true, updated_at: T2 });
  const m = merge(doc([f], [p]), doc([], [post({ id: 'p2', url: 'u2', folder_id: 'f9' })]));
  assert.equal(m.posts.find((x) => x.id === 'p1').folder_id, 'gone');
  assert.equal(m.posts.find((x) => x.id === 'p2').folder_id, 'f9');
});

test('does not mutate inputs', () => {
  const a = doc([folder()], [post()]);
  const b = doc([folder({ updated_at: T2 })], [post({ id: 'pb' })]);
  const snap = JSON.stringify([a, b]);
  merge(a, b);
  assert.equal(JSON.stringify([a, b]), snap);
});

test('commutative and idempotent', () => {
  const a = doc([folder()], [post(), post({ id: 'p3', url: 'u3', deleted: true, updated_at: T2 })]);
  const b = doc([folder({ name: 'X', updated_at: T2 })], [post({ id: 'p2', url: 'u2' })]);
  const m = merge(a, b);
  assert.deepEqual(m, merge(b, a));
  assert.deepEqual(merge(m, m), m);
  assert.deepEqual(merge(m, b), m);
  assert.deepEqual(merge(m, a), m);
});

test('a three-way merge of a small example gives the same result in two groupings', () => {
  const a = doc([], [post({ notes: 'a' })]);
  const b = doc([], [post({ notes: 'b', updated_at: T2 })]);
  const c = doc([folder()], [post({ id: 'p2', url: 'u2' })]);
  assert.deepEqual(merge(merge(a, b), c), merge(a, merge(b, c)));
});
