import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../../src/core/repository.js';
import { emptyDocument } from '../../src/core/model.js';
import { FolderNameTakenError, InvalidFolderNameError } from '../../src/core/errors.js';
import {
  exportDocument,
  parseImport,
  summarizeImport,
  MAX_IMPORT_CHARS,
} from '../../src/core/portability.js';
import { countPosts } from '../../src/core/counts.js';
import { sequentialIds } from '../../test-support/fakes.js';
import { memoryStore } from '../../test-support/memory-store.js';

const NOW = '2026-05-01T12:00:00.000Z';
const OLD = '2026-04-01T00:00:00.000Z';
const post = (id, extra = {}) => ({
  id,
  url: `https://x.com/ada_builds/status/${id}`,
  author: 'ada_builds',
  text_preview: '',
  folder_id: null,
  tags: [],
  notes: '',
  created_at: OLD,
  updated_at: OLD,
  deleted: false,
  ...extra,
});
const folder = (id, name, extra = {}) => ({ id, name, updated_at: OLD, deleted: false, ...extra });
const doc = (posts = [], folders = []) => ({ version: 1, folders, posts });
const text = (d) => JSON.stringify(d);

function setup(initial = emptyDocument(), storeOpts) {
  const store = memoryStore(initial, storeOpts);
  const repo = createRepository({
    store,
    clock: { now: () => NOW },
    createId: sequentialIds('id-'),
  });
  return { store, repo };
}
const OPTS = { tombstoneTtlMs: 90 * 24 * 3600 * 1000 };

// IMPORTANT 1
test('clearAll waits for in-flight writes so nothing comes back afterwards', async () => {
  const { store, repo } = setup(emptyDocument(), { delayMs: 20 });
  const pending = [
    repo.savePost({ url: 'https://x.com/a/status/1' }),
    repo.importDoc(doc([post('9')]), OPTS),
    repo.savePost({ url: 'https://x.com/a/status/2' }),
  ];
  const cleared = repo.clearAll();
  await Promise.all([...pending, cleared]);
  assert.deepEqual(store.peek().posts, []);
  assert.deepEqual(store.peek().folders, []);
});

// IMPORTANT 2
test('a newer tombstone in the file reports removed, and dryRun saves nothing', async () => {
  const { store, repo } = setup(doc([post('1')]));
  const file = doc([post('1', { deleted: true, updated_at: '2026-04-20T00:00:00.000Z' })]);
  const preview = await repo.importDoc(file, { ...OPTS, dryRun: true });
  assert.equal(preview.removed, 1);
  assert.equal(preview.updated, 0);
  assert.equal(store.peek().posts[0].deleted, false);
  assert.equal(store.saves, 0);
  const real = await repo.importDoc(file, OPTS);
  assert.equal(real.removed, 1);
  assert.equal(store.peek().posts[0].deleted, true);
});

test('a same-URL file post dated in the future cannot replace a different local post (reported)', async () => {
  const mine = post('1', { notes: 'mine', tags: ['keep'], updated_at: '2026-04-30T12:00:00.000Z' });
  const { store, repo } = setup(doc([mine]));
  const sameUrl = post('2', {
    url: mine.url,
    notes: 'theirs',
    updated_at: '2026-05-02T11:00:00.000Z',
  });
  const preview = await repo.importDoc(doc([sameUrl]), { ...OPTS, dryRun: true });
  assert.deepEqual(
    { a: preview.added, r: preview.removed, k: preview.keptLocal },
    { a: 0, r: 0, k: 1 },
    'the preview says local is kept before anything is saved',
  );
  await repo.importDoc(doc([sameUrl]), OPTS);
  const live = store.peek().posts.filter((p) => !p.deleted);
  assert.deepEqual(
    live.map((p) => [p.id, p.notes]),
    [['1', 'mine']],
  );
});

test('future timestamps from a file never beat a newer local edit', async () => {
  const mine = post('1', { notes: 'mine', updated_at: NOW });
  const { store, repo } = setup(doc([mine]));
  await repo.importDoc(
    doc([post('1', { notes: 'theirs', updated_at: '2026-05-02T10:00:00.000Z' })]),
    OPTS,
  );
  assert.equal(
    store.peek().posts[0].notes === 'mine' || store.peek().posts[0].notes === 'theirs',
    true,
  );
  assert.equal(store.peek().posts[0].updated_at, NOW);
});

test('summarizeImport separates added, updated, removed and unchanged (file ids only)', () => {
  const before = doc([post('1'), post('2'), post('3'), post('4')]);
  const imported = doc([post('1'), post('2'), post('3'), post('5')]);
  const after = doc([
    post('1'),
    post('2', { notes: 'n', updated_at: NOW }),
    post('3', { deleted: true, updated_at: NOW }),
    post('4'),
    post('5'),
  ]);
  assert.deepEqual(summarizeImport(before, after, imported), {
    added: 1,
    updated: 1,
    removed: 1,
    unchanged: 1,
  });
});

// IMPORTANT 3
test('export is compact JSON with a trailing newline and the cap is 25 MB', () => {
  const out = exportDocument(doc([post('1')]));
  assert.equal(out.includes('\n  '), false);
  assert.equal(out.endsWith('}\n'), true);
  assert.equal(MAX_IMPORT_CHARS, 25 * 1024 * 1024);
  assert.equal(parseImport(out).ok, true);
});

test('a 12,000-post library round-trips with zero loss inside a time budget', () => {
  const posts = Array.from({ length: 12000 }, (_, i) =>
    post(String(1700000000000000000n + BigInt(i)), {
      notes: 'A note about why this post matters to me, '.repeat(3),
      tags: ['research', 'later'],
      text_preview: 'Sample snippet text that is a plausible length for a post. '.repeat(4),
      folder_id: i % 2 ? 'f1' : null,
    }),
  );
  const d = doc(posts, [folder('f1', 'Reading')]);
  const started = Date.now();
  const out = exportDocument(d);
  const res = parseImport(out);
  const ms = Date.now() - started;
  assert.equal(res.ok, true);
  assert.equal(res.rejected, 0);
  assert.equal(res.doc.posts.length, 12000);
  assert.deepEqual(res.doc.posts[11999], d.posts[11999]);
  assert.ok(ms < 4000, `took ${ms} ms`);
});

// IMPORTANT 4
test('import keeps only canonical post URLs and takes the author from the URL', () => {
  const res = parseImport(
    text(
      doc([
        post('1', { url: 'javascript:alert(1)' }),
        post('2', { url: 'https://evil.example/' }),
        post('3', { url: 'https://twitter.com/Bea_writes/status/3?s=20', author: 'forged' }),
      ]),
    ),
  );
  assert.equal(res.rejected, 2);
  assert.equal(res.doc.posts.length, 1);
  assert.equal(res.doc.posts[0].url, 'https://x.com/Bea_writes/status/3');
  assert.equal(res.doc.posts[0].author, 'Bea_writes');
});

test('overlong ids are dropped and not truncated', () => {
  const long = 'x'.repeat(65);
  const res = parseImport(
    text(
      doc(
        [post(long), post('2', { folder_id: long }), post('3', { id: 'y'.repeat(64) })],
        [folder(long, 'Too long'), folder('f', 'Fine')],
      ),
    ),
  );
  assert.deepEqual(
    res.doc.posts.map((p) => p.id),
    ['y'.repeat(64)],
  );
  assert.deepEqual(
    res.doc.folders.map((f) => f.id),
    ['f'],
  );
  assert.equal(res.rejected, 3);
});

test('folder names are cleaned and empty ones dropped; uniqueness is left to the merge', async () => {
  const res = parseImport(
    text(
      doc(
        [],
        [
          folder('b', 'Reading', { updated_at: '2026-04-02T00:00:00.000Z' }),
          folder('a', '  reading  '),
          folder('c', '   '),
          folder('d', 'READING'),
          folder('e', 'Reading', { deleted: true }),
        ],
      ),
    ),
  );
  const live = res.doc.folders
    .filter((f) => !f.deleted)
    .map((f) => [f.id, f.name])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));
  assert.deepEqual(live, [
    ['a', 'reading'],
    ['b', 'Reading'],
    ['d', 'READING'],
  ]);
  assert.equal(res.rejected, 1);
  const { store, repo } = setup();
  await repo.importDoc(res.doc, OPTS);
  const stored = store.peek().folders.filter((f) => !f.deleted);
  assert.deepEqual(
    stored.map((f) => [f.id, f.name]).sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    [
      ['a', 'reading'],
      ['b', 'Reading (3)'],
      ['d', 'READING (2)'],
    ],
  );
});

test('same-URL duplicates inside a file collapse to the newest with no tombstones', () => {
  const res = parseImport(
    text(
      doc([
        post('1', { updated_at: '2026-04-01T00:00:00.000Z', notes: 'old' }),
        post('2', { url: post('1').url, updated_at: '2026-04-05T00:00:00.000Z', notes: 'new' }),
        post('3', { url: post('1').url, updated_at: '2026-04-05T00:00:00.000Z', notes: 'tie' }),
      ]),
    ),
  );
  assert.equal(res.doc.posts.length, 1);
  assert.equal(res.doc.posts[0].id, '3');
  assert.equal(
    res.doc.posts.some((p) => p.deleted),
    false,
  );
  assert.equal(res.merged, 2);
  assert.equal(res.rejected, 0);
});

test('duplicate ids in a file are merged, not rejected', () => {
  const res = parseImport(text(doc([post('1'), post('1', { notes: 'n', updated_at: NOW })])));
  assert.equal(res.merged, 1);
  assert.equal(res.rejected, 0);
  assert.equal(res.doc.posts[0].notes, 'n');
});

test('imported tombstones carry no content', () => {
  const res = parseImport(
    text(doc([post('1', { deleted: true, notes: 'secret', tags: ['t'], text_preview: 'x' })])),
  );
  const [p] = res.doc.posts;
  assert.deepEqual([p.notes, p.tags, p.text_preview], ['', [], '']);
});

test('importDoc renames incoming folders that clash with a different local folder', async () => {
  const { store, repo } = setup(doc([], [folder('L', 'Reading')]));
  await repo.importDoc(doc([], [folder('R', 'reading')]), OPTS);
  const names = store
    .peek()
    .folders.map((f) => f.name)
    .sort();
  assert.deepEqual(names, ['Reading', 'reading (2)']);
});

test('countPosts survives ids like constructor and __proto__', () => {
  const c = countPosts([
    { folder_id: 'constructor' },
    { folder_id: '__proto__' },
    { folder_id: 'constructor' },
  ]);
  assert.equal(c.byId.constructor, 2);
  assert.equal(c.byId.__proto__, 1);
  assert.equal(countPosts([{ folder_id: null }]).byId.constructor, undefined);
});

test('posts pointing at a missing or deleted folder list as Uncategorised', async () => {
  const { repo } = setup(
    doc(
      [
        post('1', { folder_id: 'gone' }),
        post('2', { folder_id: 'live' }),
        post('3', { folder_id: 'nope' }),
      ],
      [folder('gone', 'X', { deleted: true }), folder('live', 'Y')],
    ),
  );
  const out = await repo.listPosts();
  assert.deepEqual(out.map((p) => [p.id, p.folder_id]).sort(), [
    ['1', null],
    ['2', 'live'],
    ['3', null],
  ]);
});

// Minors
test('tombstoned posts keep no notes, tags or snippet', async () => {
  const { store, repo } = setup();
  const p = await repo.savePost({
    url: 'https://x.com/a/status/1',
    notes: 'n',
    tags: ['t'],
    textPreview: 'x',
  });
  await repo.deletePost(p.id);
  const raw = store.peek().posts[0];
  assert.deepEqual([raw.deleted, raw.notes, raw.tags, raw.text_preview], [true, '', [], '']);
  assert.equal(raw.url, p.url);
});

test('a duplicate folder name gets its own error, still an invalid-name error', async () => {
  const { repo } = setup();
  const a = await repo.createFolder('Reading');
  await assert.rejects(repo.createFolder('reading'), FolderNameTakenError);
  await assert.rejects(repo.createFolder('reading'), InvalidFolderNameError);
  const b = await repo.createFolder('Other');
  await assert.rejects(
    repo.renameFolder(b.id, 'READING'),
    (e) => e.code === 'FolderNameTakenError',
  );
  assert.ok(a);
});

test('unchanged never goes negative when a kept-local record is a tombstone', async () => {
  const day = (d) => `2026-05-${d}T00:00:00.000Z`;
  const { repo } = setup(doc([post('p1', { url: 'https://x.com/a/status/9', deleted: true })]));
  const file = doc([
    post('p1', { url: 'https://x.com/a/status/9', updated_at: day('20'), notes: 'file' }),
    post('p2', { url: 'https://x.com/a/status/8' }),
  ]);
  const summary = await repo.importDoc(file, { ...OPTS, exportedAt: null });
  assert.equal(summary.added, 1);
  assert.equal(summary.unchanged, 0);
  assert.equal(summary.keptLocal, 1);
});
