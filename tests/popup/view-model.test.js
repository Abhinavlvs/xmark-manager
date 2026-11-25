import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSaveForm,
  parseTagInput,
  folderChips,
  countPosts,
  describePost,
  emptyStateFor,
  describeError,
  safeOpenTarget,
} from '../../src/popup/view-model.js';

const folders = [
  { id: 'f2', name: 'Zed', updated_at: '', deleted: false },
  { id: 'f1', name: 'alpha', updated_at: '', deleted: false },
];

test('buildSaveForm accepts a post url', () => {
  const r = buildSaveForm('https://twitter.com/ada_builds/status/123?s=20', folders);
  assert.equal(r.canSave, true);
  assert.equal(r.author, 'ada_builds');
  assert.equal(r.canonicalUrl, 'https://x.com/ada_builds/status/123');
});

test('buildSaveForm rejects non-post tabs with the exact hint', () => {
  for (const url of ['https://x.com/home', '', undefined, 'about:blank']) {
    const r = buildSaveForm(url, folders);
    assert.equal(r.canSave, false);
    assert.equal(r.hint, 'Open a post on X to save it');
    assert.equal(r.author, null);
    assert.equal(r.canonicalUrl, null);
  }
});

test('buildSaveForm works with an empty folder list', () => {
  assert.equal(buildSaveForm('https://x.com/a/status/1', []).canSave, true);
});

test('parseTagInput splits, strips hashes, normalizes and dedupes', () => {
  assert.deepEqual(parseTagInput('#AI, ml\nai  #Rust'), ['ai', 'ml', 'rust']);
  assert.deepEqual(parseTagInput('  ,, # ,'), []);
  assert.deepEqual(parseTagInput('##x'), ['x']);
});

test('folderChips puts All and Uncategorised first, then sorted folders with counts', () => {
  const counts = { total: 5, none: 2, byId: { f1: 3 } };
  const chips = folderChips(folders, counts);
  assert.deepEqual(
    chips.map((c) => [c.label, c.id, c.count]),
    [
      ['All', undefined, 5],
      ['Uncategorised', null, 2],
      ['alpha', 'f1', 3],
      ['Zed', 'f2', 0],
    ],
  );
});

test('countPosts tallies per folder', () => {
  const posts = [{ folder_id: null }, { folder_id: 'f1' }, { folder_id: 'f1' }];
  assert.deepEqual(
    { ...countPosts(posts), byId: { ...countPosts(posts).byId } },
    { total: 3, none: 1, byId: { f1: 2 } },
  );
});

const now = new Date('2025-11-21T12:00:00.000Z');
const post = (over = {}) => ({
  id: 'p1',
  url: 'https://x.com/ada_builds/status/1234567890123456789',
  author: 'ada_builds',
  text_preview: 'hello',
  folder_id: 'f1',
  tags: ['ai'],
  notes: 'my note',
  created_at: '2025-11-21T11:58:00.000Z',
  updated_at: '',
  deleted: false,
  ...over,
});

test('describePost shapes the card fields', () => {
  const d = describePost(post(), now, folders);
  assert.equal(d.title, '@ada_builds');
  assert.equal(d.subtitle, 'hello');
  assert.equal(d.folderLabel, 'alpha');
  assert.deepEqual(d.tags, ['ai']);
  assert.ok(d.displayUrl.startsWith('x.com/ada_builds/status/1234'));
  assert.ok(d.displayUrl.endsWith('…'));
  assert.ok(d.displayUrl.length <= 36);
  assert.equal(d.savedAgo, '2m');
});

test('describePost falls back for null author, notes and uncategorised', () => {
  const d = describePost(post({ author: null, text_preview: '', folder_id: null }), now, folders);
  assert.equal(d.title, 'Post');
  assert.equal(d.subtitle, 'my note');
  assert.equal(d.folderLabel, 'Uncategorised');
});

test('describePost relative times', () => {
  const ago = (ms) => describePost(post({ created_at: new Date(+now - ms).toISOString() }), now);
  assert.equal(ago(10_000).savedAgo, 'just now');
  assert.equal(ago(5 * 60_000).savedAgo, '5m');
  assert.equal(ago(3 * 3_600_000).savedAgo, '3h');
  assert.equal(ago(3 * 86_400_000).savedAgo, 'Nov 18');
  assert.equal(ago(400 * 86_400_000).savedAgo, 'Oct 17, 2024');
});

test('emptyStateFor returns copy per kind', () => {
  for (const kind of ['library', 'no-results', 'error']) {
    const s = emptyStateFor(kind);
    assert.ok(s.title && s.body);
  }
});

test('describeError maps stable codes to readable text', () => {
  assert.match(describeError({ code: 'InvalidFolderNameError' }), /folder name/i);
  assert.match(describeError({ code: 'weird' }), /something went wrong/i);
  assert.match(describeError(null), /something went wrong/i);
});

test('safeOpenTarget returns only the canonical https x.com post url', () => {
  assert.equal(safeOpenTarget('https://x.com/a/status/1'), 'https://x.com/a/status/1');
  assert.equal(safeOpenTarget('http://x.com/a/status/1'), 'https://x.com/a/status/1');
  assert.equal(safeOpenTarget('http://twitter.com/a/status/1?s=20#x'), 'https://x.com/a/status/1');
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,<b>',
    'https://evil.com/a/status/1',
    'https://x.com.evil.com/a/status/1',
    'https://user:pw@x.com/a/status/1',
    'https://x.com/home',
    '',
    null,
    undefined,
    42,
  ])
    assert.equal(safeOpenTarget(bad), null, String(bad));
});

test('describeError has friendly storage texts and is safe against prototype keys', () => {
  assert.match(describeError({ code: 'storage_full' }), /library may be full.*Options > Data/);
  assert.equal(describeError({ code: 'storage_error' }), "Couldn't save. Try again.");
  for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.match(describeError({ code }), /something went wrong/i, code);
  }
});
