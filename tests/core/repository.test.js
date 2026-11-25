import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../../src/core/repository.js';
import { emptyDocument } from '../../src/core/model.js';
import {
  InvalidPostUrlError,
  InvalidFolderNameError,
  NotFoundError,
} from '../../src/core/errors.js';
import { sequentialIds } from '../../test-support/fakes.js';
import { memoryStore } from '../../test-support/memory-store.js';

const T0 = '2026-05-01T00:00:00.000Z';
function setup(initial = emptyDocument(), storeOpts) {
  const store = memoryStore(initial, storeOpts);
  const clockState = { t: T0 };
  const clock = { now: () => clockState.t };
  const repo = createRepository({ store, clock, createId: sequentialIds('id-') });
  return { store, repo, clockState };
}
const tick = (clockState, iso) => {
  clockState.t = iso;
};
const T1 = '2026-05-02T00:00:00.000Z';
const T2 = '2026-05-03T00:00:00.000Z';

test('error classes carry stable name and code', () => {
  for (const [Cls, name] of [
    [InvalidPostUrlError, 'InvalidPostUrlError'],
    [InvalidFolderNameError, 'InvalidFolderNameError'],
    [NotFoundError, 'NotFoundError'],
  ]) {
    const e = new Cls('m');
    assert.ok(e instanceof Error);
    assert.equal(e.name, name);
    assert.equal(e.code, name);
  }
});

test('savePost stores canonical fields from clock and ids', async () => {
  const { repo } = setup();
  const p = await repo.savePost({
    url: 'https://twitter.com/Al/status/1?s=20',
    tags: [' Rust ', 'rust'],
    notes: 'n',
    textPreview: 'hi',
  });
  assert.deepEqual(p, {
    id: 'id-1',
    url: 'https://x.com/Al/status/1',
    author: 'Al',
    text_preview: 'hi',
    folder_id: null,
    tags: ['rust'],
    notes: 'n',
    created_at: T0,
    updated_at: T0,
    deleted: false,
  });
});

test('savePost clamps notes and preview', async () => {
  const { repo } = setup();
  const p = await repo.savePost({
    url: 'https://x.com/a/status/1',
    notes: 'n'.repeat(6000),
    textPreview: 'p'.repeat(500),
  });
  assert.equal(p.notes.length, 5000);
  assert.equal(p.text_preview.length, 280);
});

test('same post via twitter.com and x.com yields one post, same id', async () => {
  const { repo, clockState } = setup();
  const a = await repo.savePost({ url: 'https://twitter.com/a/status/1', notes: 'keep' });
  tick(clockState, T1);
  const b = await repo.savePost({ url: 'https://x.com/a/status/1', tags: ['t'] });
  const list = await repo.listPosts();
  assert.equal(list.length, 1);
  assert.equal(b.id, a.id);
  assert.equal(b.created_at, T0);
  assert.equal(b.updated_at, T1);
  assert.equal(b.notes, 'keep');
  assert.deepEqual(b.tags, ['t']);
});

test('saving same post twice with provided fields replaces them', async () => {
  const { repo } = setup();
  await repo.savePost({ url: 'https://x.com/a/status/1', notes: 'old', tags: ['x'] });
  const b = await repo.savePost({ url: 'https://x.com/a/status/1', notes: 'new', tags: [] });
  assert.equal(b.notes, 'new');
  assert.deepEqual(b.tags, []);
  assert.equal((await repo.listPosts()).length, 1);
});

test('same status id with different handle is the same post', async () => {
  const { repo } = setup();
  const a = await repo.savePost({ url: 'https://x.com/a/status/1' });
  const b = await repo.savePost({ url: 'https://x.com/i/web/status/1' });
  assert.equal(b.id, a.id);
  assert.equal((await repo.listPosts()).length, 1);
});

test('invalid urls throw InvalidPostUrlError and save nothing', async () => {
  const { repo, store } = setup();
  for (const url of [
    'javascript:alert(1)',
    'https://evil.com/a/status/1',
    'https://x.com/home',
    undefined,
  ]) {
    await assert.rejects(repo.savePost({ url }), InvalidPostUrlError);
  }
  assert.equal(store.saves, 0);
  assert.deepEqual(store.peek(), emptyDocument());
});

test('savePost with unknown or deleted folder throws NotFoundError, saves nothing', async () => {
  const { repo, store } = setup();
  await assert.rejects(
    repo.savePost({ url: 'https://x.com/a/status/1', folderId: 'nope' }),
    NotFoundError,
  );
  const f = await repo.createFolder('F');
  await repo.deleteFolder(f.id);
  const saves = store.saves;
  await assert.rejects(
    repo.savePost({ url: 'https://x.com/a/status/1', folderId: f.id }),
    NotFoundError,
  );
  assert.equal(store.saves, saves);
});

test('savePost assigns a live folder', async () => {
  const { repo } = setup();
  const f = await repo.createFolder('F');
  const p = await repo.savePost({ url: 'https://x.com/a/status/1', folderId: f.id });
  assert.equal(p.folder_id, f.id);
});

test('HTML-looking text is stored as plain strings unchanged', async () => {
  const { repo, store } = setup();
  const html = '<img src=x onerror=alert(1)>&amp;';
  const p = await repo.savePost({
    url: 'https://x.com/a/status/1',
    notes: html,
    tags: [html],
    textPreview: html,
  });
  assert.equal(p.notes, html);
  assert.equal(p.text_preview, html);
  assert.deepEqual(p.tags, [html.toLowerCase()]);
  assert.equal(store.peek().posts[0].notes, html);
});

test('deletePost tombstones; listPosts hides; resave revives same id', async () => {
  const { repo, store, clockState } = setup();
  const a = await repo.savePost({ url: 'https://x.com/a/status/1', notes: 'old' });
  tick(clockState, T1);
  await repo.deletePost(a.id);
  assert.deepEqual(await repo.listPosts(), []);
  const raw = store.peek().posts[0];
  assert.equal(raw.deleted, true);
  assert.equal(raw.updated_at, T1);

  tick(clockState, T2);
  const b = await repo.savePost({ url: 'https://twitter.com/a/status/1' });
  assert.equal(b.id, a.id);
  assert.equal(b.deleted, false);
  assert.equal(b.updated_at, T2);
  assert.equal(b.notes, '');
  assert.equal(store.peek().posts.length, 1);
});

test('deletePost is idempotent and does not throw for unknown ids', async () => {
  const { repo, store, clockState } = setup();
  const a = await repo.savePost({ url: 'https://x.com/a/status/1' });
  tick(clockState, T1);
  await repo.deletePost(a.id);
  tick(clockState, T2);
  await repo.deletePost(a.id);
  await repo.deletePost('unknown');
  assert.equal(store.peek().posts[0].updated_at, T1);
});

test('updatePost changes only allowed fields and bumps updated_at', async () => {
  const { repo, clockState } = setup();
  const f = await repo.createFolder('F');
  const a = await repo.savePost({ url: 'https://x.com/a/status/1' });
  tick(clockState, T1);
  const u = await repo.updatePost(a.id, {
    folderId: f.id,
    tags: ['B'],
    notes: 'nn',
    textPreview: 'tp',
    url: 'https://x.com/evil/status/9',
    author: 'evil',
    id: 'zzz',
    deleted: true,
  });
  assert.equal(u.id, a.id);
  assert.equal(u.url, 'https://x.com/a/status/1');
  assert.equal(u.author, 'a');
  assert.equal(u.deleted, false);
  assert.equal(u.folder_id, f.id);
  assert.deepEqual(u.tags, ['b']);
  assert.equal(u.notes, 'nn');
  assert.equal(u.text_preview, 'tp');
  assert.equal(u.updated_at, T1);
  assert.equal(u.created_at, T0);
});

test('updatePost can move to uncategorised and validates folder', async () => {
  const { repo, store } = setup();
  const f = await repo.createFolder('F');
  const a = await repo.savePost({ url: 'https://x.com/a/status/1', folderId: f.id });
  const u = await repo.updatePost(a.id, { folderId: null });
  assert.equal(u.folder_id, null);
  const saves = store.saves;
  await assert.rejects(repo.updatePost(a.id, { folderId: 'nope' }), NotFoundError);
  assert.equal(store.saves, saves);
});

test('updatePost unknown or tombstoned id throws NotFoundError', async () => {
  const { repo } = setup();
  await assert.rejects(repo.updatePost('nope', { notes: 'x' }), NotFoundError);
  const a = await repo.savePost({ url: 'https://x.com/a/status/1' });
  await repo.deletePost(a.id);
  await assert.rejects(repo.updatePost(a.id, { notes: 'x' }), NotFoundError);
});

test('listPosts is newest first by created_at then id', async () => {
  const { repo, clockState } = setup();
  await repo.savePost({ url: 'https://x.com/a/status/1' });
  await repo.savePost({ url: 'https://x.com/a/status/2' });
  tick(clockState, T1);
  await repo.savePost({ url: 'https://x.com/a/status/3' });
  const ids = (await repo.listPosts()).map((p) => p.id);
  assert.deepEqual(ids, ['id-3', 'id-2', 'id-1']);
});

test('folder name validation: trim, collapse, length, empty', async () => {
  const { repo } = setup();
  const f = await repo.createFolder('  My   Reads  ');
  assert.equal(f.name, 'My Reads');
  for (const bad of ['', '   ', 'x'.repeat(81), undefined, 5]) {
    await assert.rejects(repo.createFolder(bad), InvalidFolderNameError);
  }
  assert.equal((await repo.createFolder('x'.repeat(80))).name.length, 80);
});

test('duplicate live folder name rejected case-insensitively; deleted names reusable', async () => {
  const { repo } = setup();
  const f = await repo.createFolder('Reads');
  await assert.rejects(repo.createFolder('reads'), InvalidFolderNameError);
  await repo.deleteFolder(f.id);
  await repo.createFolder('READS');
});

test('renameFolder: validates, allows case change, unknown throws', async () => {
  const { repo, clockState } = setup();
  const a = await repo.createFolder('Reads');
  const b = await repo.createFolder('Other');
  tick(clockState, T1);
  const r = await repo.renameFolder(a.id, 'READS');
  assert.equal(r.name, 'READS');
  assert.equal(r.updated_at, T1);
  await assert.rejects(repo.renameFolder(a.id, 'other'), InvalidFolderNameError);
  await assert.rejects(repo.renameFolder(a.id, ' '), InvalidFolderNameError);
  await assert.rejects(repo.renameFolder('nope', 'Z'), NotFoundError);
  await repo.deleteFolder(b.id);
  await assert.rejects(repo.renameFolder(b.id, 'Z'), NotFoundError);
});

test('listFolders returns live folders sorted by name case-insensitively', async () => {
  const { repo } = setup();
  await repo.createFolder('banana');
  await repo.createFolder('Apple');
  const c = await repo.createFolder('cherry');
  await repo.deleteFolder(c.id);
  assert.deepEqual(
    (await repo.listFolders()).map((f) => f.name),
    ['Apple', 'banana'],
  );
});

test('deleteFolder tombstones, moves live posts to null and bumps them', async () => {
  const { repo, store, clockState } = setup();
  const f = await repo.createFolder('F');
  const g = await repo.createFolder('G');
  const a = await repo.savePost({ url: 'https://x.com/a/status/1', folderId: f.id });
  const b = await repo.savePost({ url: 'https://x.com/a/status/2', folderId: g.id });
  tick(clockState, T1);
  await repo.deleteFolder(f.id);
  const doc = store.peek();
  const rf = doc.folders.find((x) => x.id === f.id);
  assert.equal(rf.deleted, true);
  assert.equal(rf.updated_at, T1);
  const pa = doc.posts.find((x) => x.id === a.id);
  assert.equal(pa.folder_id, null);
  assert.equal(pa.updated_at, T1);
  const pb = doc.posts.find((x) => x.id === b.id);
  assert.equal(pb.folder_id, g.id);
  assert.equal(pb.updated_at, T0);
});

test('deleteFolder of unknown or already deleted id does not throw or save changes', async () => {
  const { repo } = setup();
  await repo.deleteFolder('nope');
  const f = await repo.createFolder('F');
  await repo.deleteFolder(f.id);
  await repo.deleteFolder(f.id);
});

test('concurrent savePost calls with an async store all survive', async () => {
  const { repo, store } = setup(emptyDocument(), { delayMs: 5 });
  await Promise.all(
    [1, 2, 3, 4, 5].map((n) => repo.savePost({ url: `https://x.com/a/status/${n}` })),
  );
  assert.equal(store.peek().posts.length, 5);
  assert.equal(new Set(store.peek().posts.map((p) => p.id)).size, 5);
});

test('concurrent mixed operations are serialized', async () => {
  const { repo, store } = setup(emptyDocument(), { delayMs: 3 });
  const [f] = await Promise.all([
    repo.createFolder('F'),
    repo.savePost({ url: 'https://x.com/a/status/1' }),
    repo.savePost({ url: 'https://x.com/a/status/1' }),
  ]);
  assert.equal(store.peek().folders.length, 1);
  assert.equal(store.peek().posts.length, 1);
  assert.ok(f.id);
});

test('failed operations do not poison the queue or save partial state', async () => {
  const { repo, store } = setup(emptyDocument(), { delayMs: 2, failSaveTimes: 1 });
  const results = await Promise.allSettled([
    repo.savePost({ url: 'https://x.com/a/status/1' }), // store save fails
    repo.savePost({ url: 'javascript:alert(1)' }), // invalid
    repo.savePost({ url: 'https://x.com/a/status/2' }), // succeeds
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].status, 'fulfilled');
  const posts = store.peek().posts;
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://x.com/a/status/2');
});

test('listings do not leak internal state', async () => {
  const { repo } = setup();
  await repo.savePost({ url: 'https://x.com/a/status/1' });
  (await repo.listPosts())[0].notes = 'mutated';
  assert.equal((await repo.listPosts())[0].notes, '');
});

test('exportDoc returns a copy; importDoc merges serialized and returns a summary', async () => {
  const { repo, store } = setup();
  await repo.savePost({ url: 'https://x.com/a/status/1' });
  const snap = await repo.exportDoc();
  snap.posts.length = 0;
  assert.equal(store.peek().posts.length, 1);
  const imported = {
    version: 1,
    folders: [],
    posts: [
      { ...store.peek().posts[0] },
      { ...store.peek().posts[0], id: 'zz', url: 'https://x.com/b/status/2' },
    ],
  };
  const opts = { tombstoneTtlMs: 1e12 };
  assert.deepEqual(await repo.importDoc(imported, opts), {
    added: 1,
    updated: 0,
    removed: 0,
    unchanged: 1,
    foldersChanged: 0,
    keptLocal: 0,
    keptLocalFolders: 0,
  });
  assert.deepEqual(await repo.importDoc(imported, opts), {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 2,
    foldersChanged: 0,
    keptLocal: 0,
    keptLocalFolders: 0,
  });
  assert.equal(store.peek().posts.length, 2);
});

test('every public write performs exactly one store.save', async () => {
  const { repo, store } = setup();
  const once = async (name, fn) => {
    const before = store.saves;
    await fn();
    assert.equal(store.saves - before, 1, name);
  };
  const folder = await repo.createFolder('A');
  await once('createFolder', () => repo.createFolder('B'));
  const post = await repo.savePost({ url: 'https://x.com/a/status/1' });
  await once('savePost', () => repo.savePost({ url: 'https://x.com/a/status/2' }));
  await once('updatePost', () => repo.updatePost(post.id, { notes: 'n' }));
  await once('renameFolder', () => repo.renameFolder(folder.id, 'A2'));
  await once('deletePost', () => repo.deletePost(post.id));
  await once('deleteFolder', () => repo.deleteFolder(folder.id));
  const imported = { version: 1, folders: [], posts: [] };
  await once('importDoc', () => repo.importDoc(imported, { tombstoneTtlMs: 1e9 }));
});

test('a failing save rejects, claims nothing, and later queued operations still run', async () => {
  const { repo, store } = setup();
  const realSave = store.save.bind(store);
  let calls = 0;
  store.save = async (doc) => {
    calls += 1;
    if (calls === 2) throw new Error('quota');
    return realSave(doc);
  };
  const first = repo.savePost({ url: 'https://x.com/a/status/1' });
  const second = repo.savePost({ url: 'https://x.com/a/status/2' });
  const third = repo.savePost({ url: 'https://x.com/a/status/3' });
  assert.equal((await first).url, 'https://x.com/a/status/1');
  await assert.rejects(second, /quota/);
  assert.equal((await third).url, 'https://x.com/a/status/3');
  const urls = (await repo.listPosts()).map((p) => p.url).sort();
  assert.deepEqual(urls, ['https://x.com/a/status/1', 'https://x.com/a/status/3']);
  assert.equal(store.peek().posts.length, 2, 'the failed post was never persisted');
});

test('allowPreview gates the text snippet and runs inside the queue, after earlier writes', async () => {
  const { repo, store } = setup(emptyDocument(), { delayMs: 5 });
  let savesWhenAsked = -1;
  const first = repo.savePost({ url: 'https://x.com/a/status/1' });
  const second = repo.savePost(
    { url: 'https://x.com/a/status/2', textPreview: 'secret' },
    {
      allowPreview: async () => {
        savesWhenAsked = store.saves;
        return false;
      },
    },
  );
  const third = repo.savePost(
    { url: 'https://x.com/a/status/3', textPreview: 'ok' },
    { allowPreview: async () => true },
  );
  await Promise.all([first, second, third]);
  assert.equal(savesWhenAsked, 1, 'asked only after the first write finished');
  const byUrl = Object.fromEntries((await repo.listPosts()).map((p) => [p.url.at(-1), p]));
  assert.deepEqual([byUrl[2].text_preview, byUrl[3].text_preview], ['', 'ok']);
  const patched = await repo.updatePost(
    byUrl[3].id,
    { textPreview: 'no' },
    { allowPreview: async () => false },
  );
  assert.equal(patched.text_preview, 'ok');
});

test('allowPreview may return a length: the stored snippet is cut to it (at most 280)', async () => {
  const { repo } = setup(emptyDocument());
  const long = 'x'.repeat(280);
  const a = await repo.savePost(
    { url: 'https://x.com/a/status/1', textPreview: long },
    { allowPreview: async () => 60 },
  );
  assert.equal(a.text_preview, 'x'.repeat(60));
  const b = await repo.savePost(
    { url: 'https://x.com/a/status/2', textPreview: long + 'more' },
    { allowPreview: async () => 999 },
  );
  assert.equal(b.text_preview.length, 280);
  const c = await repo.savePost(
    { url: 'https://x.com/a/status/3', textPreview: long },
    { allowPreview: async () => true },
  );
  assert.equal(c.text_preview.length, 280);
  const u = await repo.updatePost(a.id, { textPreview: long }, { allowPreview: async () => 45 });
  assert.equal(u.text_preview, 'x'.repeat(45));
});

test('the clamp never splits a surrogate pair and leaves stored snippets alone', async () => {
  const { repo } = setup(emptyDocument());
  const emoji = 'a'.repeat(39) + '\u{1F600}tail';
  const p = await repo.savePost(
    { url: 'https://x.com/a/status/1', textPreview: emoji },
    { allowPreview: async () => 40 },
  );
  assert.equal(p.text_preview, 'a'.repeat(39));
  const q = await repo.savePost(
    { url: 'https://x.com/a/status/2', textPreview: 'k'.repeat(200) },
    { allowPreview: async () => 280 },
  );
  // a later, smaller setting does not rewrite what is already stored
  await repo.savePost(
    { url: 'https://x.com/a/status/3', notes: 'n' },
    { allowPreview: async () => 35 },
  );
  const stored = (await repo.listPosts()).find((x) => x.id === q.id);
  assert.equal(stored.text_preview.length, 200);
});
