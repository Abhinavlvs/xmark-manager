import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportDocument,
  parseImport,
  summarizeImport,
  MAX_IMPORT_CHARS,
} from '../../src/core/portability.js';
import { mergeDocuments, TOMBSTONE_TTL_MS } from '../../src/core/merge.js';

const T = '2026-01-01T00:00:00.000Z';
const post = (id, extra = {}) => ({
  id,
  url: `https://x.com/ada_builds/status/${id}`,
  author: 'ada_builds',
  text_preview: '',
  folder_id: null,
  tags: ['a'],
  notes: '',
  created_at: T,
  updated_at: T,
  deleted: false,
  ...extra,
});
const doc = (posts = [], folders = []) => ({ version: 1, folders, posts });

test('export is compact JSON with a version and round-trips', () => {
  const d = doc([post('1')], [{ id: 'f', name: 'Reading', updated_at: T, deleted: false }]);
  const text = exportDocument(d);
  assert.match(text, /^\{"version":1,/);
  const res = parseImport(text);
  assert.equal(res.ok, true);
  assert.deepEqual(res.doc, d);
});

test('junk, wrong version, non-object roots and oversize are rejected without throwing', () => {
  for (const bad of [
    '',
    'not json',
    '[]',
    'null',
    '5',
    '"x"',
    '{"version":2,"folders":[],"posts":[]}',
    '{}',
  ]) {
    const res = parseImport(bad);
    assert.equal(res.ok, false, bad);
    assert.equal(typeof res.error, 'string');
  }
  assert.equal(parseImport('x'.repeat(MAX_IMPORT_CHARS + 1)).ok, false);
  assert.equal(parseImport(undefined).ok, false);
  assert.equal(parseImport({}).ok, false);
});

test('malformed records are dropped and counted as rejected', () => {
  const text = JSON.stringify({ version: 1, folders: [5], posts: [post('1'), { id: 2 }, null] });
  const res = parseImport(text);
  assert.equal(res.ok, true);
  assert.equal(res.doc.posts.length, 1);
  assert.equal(res.rejected, 3);
});

test('__proto__ keys do not pollute and are not copied', () => {
  const text =
    '{"version":1,"__proto__":{"polluted":true},"folders":[],"posts":[{"id":"1","url":"https://x.com/a/status/1","__proto__":{"polluted":true},"constructor":{"x":1}}]}';
  const res = parseImport(text);
  assert.equal(res.ok, true);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(res.doc.posts[0], '__proto__'), false);
  assert.equal(Object.hasOwn(res.doc.posts[0], 'constructor'), false);
});

test('summarizeImport counts added, updated and unchanged posts', () => {
  const before = doc([post('1'), post('2')]);
  const after = doc([
    post('1'),
    post('2', { notes: 'n', updated_at: '2026-02-01T00:00:00.000Z' }),
    post('3'),
  ]);
  assert.deepEqual(summarizeImport(before, after), {
    added: 1,
    updated: 1,
    removed: 0,
    unchanged: 1,
  });
});

test('importing the same file twice is idempotent', () => {
  const local = doc([post('1')]);
  const imported = parseImport(exportDocument(doc([post('1'), post('2')]))).doc;
  const opts = { now: '2026-03-01T00:00:00.000Z', tombstoneTtlMs: TOMBSTONE_TTL_MS };
  const once = mergeDocuments(local, imported, opts);
  const twice = mergeDocuments(once, imported, opts);
  assert.deepEqual(twice, once);
  assert.deepEqual(summarizeImport(once, twice), {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 2,
  });
});
