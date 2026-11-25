import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../../src/core/repository.js';
import { emptyDocument } from '../../src/core/model.js';
import { exportDocument, parseImport } from '../../src/core/portability.js';
import { sequentialIds } from '../../test-support/fakes.js';
import { memoryStore } from '../../test-support/memory-store.js';

const OLD = '2026-04-01T00:00:00.000Z';
const NOW1 = '2026-05-01T12:00:00.000Z';
const EDIT = '2026-05-03T09:00:00.000Z';
const NOW3 = '2026-05-10T12:00:00.000Z';
const FUTURE = '2027-01-01T00:00:00.000Z';
const TTL = { tombstoneTtlMs: 90 * 24 * 3600 * 1000 };
const folder = (id, name, extra = {}) => ({ id, name, updated_at: OLD, deleted: false, ...extra });
const post = (id, extra = {}) => ({
  id,
  url: `https://x.com/ada/status/${id}`,
  author: 'ada',
  text_preview: '',
  folder_id: null,
  tags: [],
  notes: '',
  created_at: OLD,
  updated_at: OLD,
  deleted: false,
  ...extra,
});
const doc = (posts = [], folders = []) => ({ version: 1, folders, posts });

function setup(initial = emptyDocument()) {
  const store = memoryStore(initial);
  const clock = { t: NOW1 };
  const repo = createRepository({
    store,
    clock: { now: () => clock.t },
    createId: sequentialIds(),
  });
  return { store, repo, clock };
}
const names = (store) =>
  store
    .peek()
    .folders.filter((f) => !f.deleted)
    .map((f) => f.name)
    .sort();
const importText = (text) => parseImport(text);

test('folder names are made unique once, against local and file together, only when needed', async () => {
  const { store, repo } = setup(doc([], [folder('L', 'Reading')]));
  const parsed = importText(
    JSON.stringify(doc([], [folder('a', 'Reading'), folder('b', 'reading'), folder('c', 'Code')])),
  );
  assert.deepEqual(
    parsed.doc.folders.map((f) => f.name),
    ['Reading', 'reading', 'Code'],
    'parseImport only cleans names; uniqueness is decided once, in the merge',
  );
  await repo.importDoc(parsed.doc, TTL);
  assert.deepEqual(names(store), ['Code', 'Reading', 'Reading (2)', 'reading (3)']);
  assert.equal(
    names(store).some((n) => /\(\d+\) \(\d+\)/.test(n)),
    false,
  );
});

test('a file whose names do not clash with local ones is imported unchanged', async () => {
  const { store, repo } = setup(doc([], [folder('L', 'Work')]));
  await repo.importDoc(doc([], [folder('a', 'Reading'), folder('b', 'Code')]), TTL);
  assert.deepEqual(names(store), ['Code', 'Reading', 'Work']);
});

test('importing the same file again does not rename or change anything', async () => {
  const { store, repo } = setup(doc([], [folder('L', 'Reading')]));
  const file = doc([], [folder('a', 'Reading'), folder('b', 'Reading')]);
  await repo.importDoc(file, TTL);
  const before = store.peek();
  const second = await repo.importDoc(file, TTL);
  assert.deepEqual(store.peek(), before);
  assert.equal(second.foldersChanged, 0);
});

test('export carries exported_at and parseImport reads it back (ignored when invalid)', () => {
  const text = exportDocument(doc(), '2026-05-01T12:00:00.000Z');
  assert.match(text, /^\{"version":1,"exported_at":"2026-05-01T12:00:00.000Z",/);
  assert.equal(parseImport(text).exportedAt, '2026-05-01T12:00:00.000Z');
  assert.equal(parseImport('{"version":1,"folders":[],"posts":[]}').exportedAt, null);
  assert.equal(
    parseImport('{"version":1,"exported_at":"junk","folders":[],"posts":[]}').exportedAt,
    null,
  );
  assert.equal(
    parseImport('{"version":1,"exported_at":5,"folders":[],"posts":[]}').exportedAt,
    null,
  );
});

test('future-dated records are clamped to the file exported_at, so re-import never beats a later edit', async () => {
  const { store, repo, clock } = setup();
  const file = doc([post('1', { updated_at: FUTURE, notes: 'from file' })]);
  const opts = { ...TTL, exportedAt: '2026-05-01T08:00:00.000Z' };
  await repo.importDoc(file, opts);
  assert.equal(store.peek().posts[0].updated_at, '2026-05-01T08:00:00.000Z');
  clock.t = EDIT;
  await repo.updatePost('1', { notes: 'my edit' });
  clock.t = NOW3;
  await repo.importDoc(file, opts);
  assert.equal(store.peek().posts[0].notes, 'my edit');
  assert.equal(store.peek().posts[0].updated_at, EDIT);
});

test('an exported_at later than now is clamped to now', async () => {
  const { store, repo } = setup();
  await repo.importDoc(doc([post('1', { updated_at: FUTURE })]), { ...TTL, exportedAt: FUTURE });
  assert.equal(store.peek().posts[0].updated_at, NOW1);
});

test('without exported_at, a record identical to the local one is never bumped', async () => {
  const { store, repo, clock } = setup();
  const file = doc([post('1', { updated_at: FUTURE })]);
  await repo.importDoc(file, TTL);
  assert.equal(store.peek().posts[0].updated_at, NOW1);
  clock.t = NOW3;
  const again = await repo.importDoc(file, TTL);
  assert.equal(store.peek().posts[0].updated_at, NOW1, 'not re-bumped to the new now');
  assert.deepEqual([again.added, again.updated, again.removed, again.unchanged], [0, 0, 0, 1]);
});

test('a record that is not future-dated still wins by last-writer-wins without exported_at', async () => {
  const { store, repo, clock } = setup(doc([post('1', { notes: 'old', updated_at: OLD })]));
  clock.t = NOW3;
  const res = await repo.importDoc(
    doc([post('1', { notes: 'new', updated_at: '2026-05-05T00:00:00.000Z' })]),
    TTL,
  );
  assert.equal(store.peek().posts[0].notes, 'new');
  assert.equal(res.keptLocal, 0);
});

test('when the clock falls back to now, a clamped record never replaces a different local one', async () => {
  const { store, repo, clock } = setup(doc([post('1', { notes: 'mine', updated_at: OLD })]));
  clock.t = NOW3;
  const res = await repo.importDoc(doc([post('1', { notes: 'file', updated_at: FUTURE })]), TTL);
  assert.equal(store.peek().posts[0].notes, 'mine');
  assert.equal(store.peek().posts[0].updated_at, OLD);
  assert.equal(res.keptLocal, 1);
  assert.equal(res.updated, 0);
});

const FILE_FUTURE = (notes) => doc([post('1', { updated_at: '2026-11-23T08:00:00.000Z', notes })]);

test('probe2: exported_at from a clock that runs ahead cannot beat later local edits, three times over', async () => {
  const { store, repo, clock } = setup();
  const opts = { ...TTL, exportedAt: '2026-11-23T08:00:00.000Z' };
  clock.t = '2026-11-21T09:00:00.000Z';
  const first = await repo.importDoc(FILE_FUTURE('from file'), opts);
  assert.equal(first.added, 1);
  assert.equal(first.keptLocal, 0);
  assert.equal(store.peek().posts[0].notes, 'from file');
  clock.t = '2026-11-21T10:00:00.000Z';
  await repo.updatePost('1', { notes: 'my local edit' });
  for (const hour of ['11', '12', '13']) {
    clock.t = `2026-11-21T${hour}:00:00.000Z`;
    const again = await repo.importDoc(FILE_FUTURE('from file'), opts);
    assert.equal(store.peek().posts[0].notes, 'my local edit', `re-import at ${hour}h`);
    assert.equal(again.keptLocal, 1);
    assert.equal(again.updated, 0);
  }
  assert.equal(store.peek().posts[0].updated_at, '2026-11-21T10:00:00.000Z');
});

test('the same holds for a file without exported_at and for an invalid one', async () => {
  for (const exportedAt of [null, undefined]) {
    const { store, repo, clock } = setup();
    clock.t = '2026-11-21T09:00:00.000Z';
    await repo.importDoc(FILE_FUTURE('from file'), { ...TTL, exportedAt });
    clock.t = '2026-11-21T10:00:00.000Z';
    await repo.updatePost('1', { notes: 'my local edit' });
    clock.t = '2026-11-21T12:00:00.000Z';
    await repo.importDoc(FILE_FUTURE('from file'), { ...TTL, exportedAt });
    assert.equal(store.peek().posts[0].notes, 'my local edit');
  }
});

test('with a valid exported_at in the past, normal last-writer-wins applies (and keptLocal is 0)', async () => {
  const { store, repo, clock } = setup(doc([post('1', { notes: 'old', updated_at: OLD })]));
  clock.t = NOW3;
  const res = await repo.importDoc(
    doc([post('1', { notes: 'newer', updated_at: '2026-05-02T00:00:00.000Z' })]),
    { ...TTL, exportedAt: '2026-05-02T00:00:00.000Z' },
  );
  assert.equal(store.peek().posts[0].notes, 'newer');
  assert.equal(res.keptLocal, 0);
});

test('non-conflicting records still import while conflicting ones are kept local', async () => {
  const { store, repo, clock } = setup(doc([post('1', { notes: 'mine' })]));
  clock.t = NOW3;
  const res = await repo.importDoc(
    doc([post('1', { notes: 'file', updated_at: FUTURE }), post('2', { updated_at: FUTURE })]),
    TTL,
  );
  assert.deepEqual([res.added, res.keptLocal], [1, 1]);
  assert.equal(store.peek().posts.find((p) => p.id === '1').notes, 'mine');
});

test('a kept-local record is not also counted as unchanged', async () => {
  const { repo, clock } = setup();
  const opts = { ...TTL, exportedAt: '2026-11-23T08:00:00.000Z' };
  clock.t = '2026-11-21T09:00:00.000Z';
  await repo.importDoc(FILE_FUTURE('from file'), opts);
  clock.t = '2026-11-21T10:00:00.000Z';
  await repo.updatePost('1', { notes: 'my local edit' });
  const again = await repo.importDoc(FILE_FUTURE('from file'), opts);
  assert.deepEqual([again.keptLocal, again.unchanged, again.updated, again.added], [1, 0, 0, 0]);
});

test('folders that cannot prove they are newer lose to a different local folder, and are counted', async () => {
  const { store, repo, clock } = setup(doc([], [folder('f1', 'Mine', { updated_at: OLD })]));
  clock.t = NOW3;
  const res = await repo.importDoc(
    doc([], [folder('f1', 'Theirs', { updated_at: FUTURE }), folder('f2', 'New')]),
    TTL,
  );
  assert.equal(store.peek().folders.find((f) => f.id === 'f1').name, 'Mine');
  assert.ok(store.peek().folders.some((f) => f.name === 'New'));
  assert.equal(res.keptLocalFolders, 1);
  assert.equal(res.keptLocal, 0);
});

const crossId = (id, notes, over = {}) =>
  post(id, { url: 'https://x.com/ada/status/7', notes, ...over });

test('probe 9G: an unprovable record with another id but the same status cannot tombstone an edited local post', async () => {
  const { store, repo, clock } = setup(doc([crossId('L', 'my edit', { updated_at: EDIT })]));
  clock.t = NOW3;
  const res = await repo.importDoc(doc([crossId('F', 'file copy', { updated_at: FUTURE })]), TTL);
  const live = store.peek().posts.filter((p) => !p.deleted);
  assert.deepEqual(
    live.map((p) => [p.id, p.notes]),
    [['L', 'my edit']],
  );
  assert.equal(store.peek().posts.find((p) => p.id === 'L').deleted, false);
  assert.equal(res.keptLocal, 1);
  assert.equal(res.added, 0);
  assert.equal(res.removed, 0);
});

test('a cross-id unprovable record with identical content is dropped quietly; a provable one still wins', async () => {
  const { store, repo, clock } = setup(doc([crossId('L', 'same', { updated_at: OLD })]));
  clock.t = NOW3;
  const quiet = await repo.importDoc(doc([crossId('F', 'same', { updated_at: FUTURE })]), TTL);
  assert.equal(quiet.keptLocal, 0);
  assert.deepEqual(
    store
      .peek()
      .posts.filter((p) => !p.deleted)
      .map((p) => p.id),
    ['L'],
  );
  const provable = await repo.importDoc(
    doc([crossId('F', 'newer', { updated_at: '2026-05-05T00:00:00.000Z' })]),
    { ...TTL, exportedAt: '2026-05-05T00:00:00.000Z' },
  );
  assert.equal(provable.keptLocal, 0);
  assert.deepEqual(
    store
      .peek()
      .posts.filter((p) => !p.deleted)
      .map((p) => [p.id, p.notes]),
    [['F', 'newer']],
  );
});
