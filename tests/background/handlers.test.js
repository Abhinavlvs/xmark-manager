import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers } from '../../src/background/handlers.js';
import { MSG } from '../../src/platform/messages.js';
import { InvalidPostUrlError, NotFoundError } from '../../src/core/errors.js';

function setup({ saveSnippets = false, snippetLength, extra = {}, repoOverrides = {} } = {}) {
  const calls = [];
  const rec =
    (name, ret) =>
    async (...args) => {
      calls.push([name, ...args]);
      return ret;
    };
  const repo = {
    savePost: rec('savePost', { id: 'p1' }),
    updatePost: rec('updatePost', { id: 'p1' }),
    deletePost: rec('deletePost'),
    listPosts: rec('listPosts', [
      {
        id: 'a',
        url: 'u',
        author: 'x',
        notes: 'hello',
        text_preview: '',
        tags: ['t'],
        folder_id: 'f',
      },
      { id: 'b', url: 'v', author: 'y', notes: '', text_preview: '', tags: [], folder_id: null },
    ]),
    createFolder: rec('createFolder', { id: 'f1' }),
    renameFolder: rec('renameFolder', { id: 'f1' }),
    deleteFolder: rec('deleteFolder'),
    listFolders: rec('listFolders', []),
    clearAll: rec('clearAll'),
    exportDoc: rec('exportDoc', { version: 1, folders: [], posts: [] }),
    importDoc: rec('importDoc', {
      added: 1,
      updated: 0,
      removed: 0,
      unchanged: 2,
      foldersChanged: 0,
    }),
    ...repoOverrides,
  };
  let settings = {
    saveSnippets,
    ...(snippetLength === undefined ? {} : { snippetLength }),
    ...extra,
  };
  const settingsPort = {
    clear: rec('settingsClear'),
    get: async () => settings,
    set: async (p) => {
      calls.push(['setSettings', p]);
      settings = { ...settings, ...p };
      return settings;
    },
  };
  const raw = createHandlers({
    repo,
    settings: settingsPort,
    clock: { now: () => '2026-11-21T10:00:00.000Z' },
  });
  // Extension pages pass their origin explicitly; omitting it fails closed (see below).
  const handle = (message, ctx = { origin: 'extension' }) => raw(message, ctx);
  return { handle, raw, calls };
}

test('SAVE_POST whitelists fields and drops cookie/token', async () => {
  const { handle, calls } = setup();
  const res = await handle({
    type: MSG.SAVE_POST,
    payload: {
      url: 'https://x.com/a/status/1',
      folderId: 'f',
      tags: ['a'],
      notes: 'n',
      cookie: 'c',
      token: 't',
      textPreview: 'secret',
    },
  });
  assert.deepEqual(res, { ok: true, data: { id: 'p1' } });
  assert.deepEqual(calls[0][1], {
    url: 'https://x.com/a/status/1',
    folderId: 'f',
    tags: ['a'],
    notes: 'n',
    textPreview: 'secret',
  });
  // The setting is consulted by the repository inside its queue, not by the handler up front.
  assert.equal(await calls[0][2].allowPreview(), 0);
});

test('SAVE_POST keeps textPreview when saveSnippets is on', async () => {
  const { handle, calls } = setup({ saveSnippets: true });
  await handle({ type: MSG.SAVE_POST, payload: { url: 'u', textPreview: 'hi' } });
  assert.deepEqual(calls[0][1], { url: 'u', textPreview: 'hi' });
});

test('SAVE_POST rejects bad types and oversized tag lists', async () => {
  const { handle, calls } = setup();
  for (const payload of [
    null,
    {},
    { url: 5 },
    { url: 'u', tags: 'a' },
    { url: 'u', tags: [1] },
    { url: 'u', tags: Array(21).fill('a') },
    { url: 'u', notes: 5 },
    { url: 'u', folderId: 5 },
  ]) {
    const res = await handle({ type: MSG.SAVE_POST, payload });
    assert.equal(res.ok, false);
  }
  assert.equal(calls.length, 0);
});

test('UPDATE_POST whitelists patch with snippet gate', async () => {
  const { handle, calls } = setup();
  await handle({
    type: MSG.UPDATE_POST,
    payload: { id: 'p1', patch: { notes: 'n', textPreview: 'x', url: 'evil', token: 't' } },
  });
  assert.deepEqual(calls[0].slice(0, 3), ['updatePost', 'p1', { notes: 'n', textPreview: 'x' }]);
  assert.equal(await calls[0][3].allowPreview(), 0);
  const on = setup({ saveSnippets: true });
  await on.handle({ type: MSG.UPDATE_POST, payload: { id: 'p1', patch: { textPreview: 'x' } } });
  assert.deepEqual(on.calls[0].slice(0, 3), ['updatePost', 'p1', { textPreview: 'x' }]);
  assert.equal(await on.calls[0][3].allowPreview(), 280);
  assert.equal((await handle({ type: MSG.UPDATE_POST, payload: { patch: {} } })).ok, false);
});

test('LIST_POSTS filters; empty tag means no tag filter', async () => {
  const { handle } = setup();
  const all = await handle({ type: MSG.LIST_POSTS, payload: { tag: '   ' } });
  assert.equal(all.data.length, 2);
  assert.equal((await handle({ type: MSG.LIST_POSTS })).data.length, 2);
  assert.deepEqual(
    (await handle({ type: MSG.LIST_POSTS, payload: { text: 'hello' } })).data.map((p) => p.id),
    ['a'],
  );
  assert.deepEqual(
    (await handle({ type: MSG.LIST_POSTS, payload: { tag: 't' } })).data.map((p) => p.id),
    ['a'],
  );
  assert.deepEqual(
    (await handle({ type: MSG.LIST_POSTS, payload: { folderId: 'f' } })).data.map((p) => p.id),
    ['a'],
  );
});

test('folder, delete, settings and clear messages map to their calls', async () => {
  const { handle, calls } = setup();
  assert.deepEqual(await handle({ type: MSG.DELETE_POST, payload: { id: 'p1' } }), { ok: true });
  await handle({ type: MSG.LIST_FOLDERS });
  await handle({ type: MSG.CREATE_FOLDER, payload: { name: 'N' } });
  await handle({ type: MSG.RENAME_FOLDER, payload: { id: 'f1', name: 'M' } });
  await handle({ type: MSG.DELETE_FOLDER, payload: { id: 'f1' } });
  assert.deepEqual((await handle({ type: MSG.GET_SETTINGS })).data, { saveSnippets: false });
  assert.deepEqual(
    (await handle({ type: MSG.SET_SETTINGS, payload: { saveSnippets: true, x: 1 } })).data,
    { saveSnippets: true },
  );
  assert.deepEqual(await handle({ type: MSG.DELETE_ALL_DATA }), { ok: true });
  assert.deepEqual(
    calls.map((c) => c[0]),
    [
      'deletePost',
      'listFolders',
      'createFolder',
      'renameFolder',
      'deleteFolder',
      'setSettings',
      'clearAll',
      'settingsClear',
    ],
  );
  assert.deepEqual(calls.find((c) => c[0] === 'setSettings')[1], { saveSnippets: true });
});

test('domain errors map to their code', async () => {
  const { handle } = setup({
    repoOverrides: {
      savePost: async () => {
        throw new InvalidPostUrlError('bad https://x.com/secret');
      },
      deleteFolder: async () => {
        throw new NotFoundError('nope');
      },
    },
  });
  assert.deepEqual(await handle({ type: MSG.SAVE_POST, payload: { url: 'u' } }), {
    ok: false,
    error: 'InvalidPostUrlError',
  });
  assert.deepEqual(await handle({ type: MSG.DELETE_FOLDER, payload: { id: 'x' } }), {
    ok: false,
    error: 'NotFoundError',
  });
});

test('unknown errors become internal_error without leaking details', async () => {
  const { handle } = setup({
    repoOverrides: {
      listFolders: async () => {
        throw new Error('disk path /secret https://x.com/a/status/1');
      },
    },
  });
  assert.deepEqual(await handle({ type: MSG.LIST_FOLDERS }), {
    ok: false,
    error: 'internal_error',
  });
});

test('unknown message type', async () => {
  const { handle } = setup();
  assert.deepEqual(await handle({ type: 'NOPE' }), { ok: false, error: 'unknown_message' });
  assert.deepEqual(await handle(null), { ok: false, error: 'unknown_message' });
});

test('content origin: GET_SETTINGS exposes exactly saveSnippets and snippetLength', async () => {
  const { handle } = setup({ saveSnippets: true, snippetLength: 60 });
  const res = await handle({ type: MSG.GET_SETTINGS }, { origin: 'content' });
  assert.deepEqual(res, { ok: true, data: { saveSnippets: true, snippetLength: 60 } });
  const leaky = setup({ saveSnippets: true, extra: { token: 'x', other: 1 } });
  const out = await leaky.handle({ type: MSG.GET_SETTINGS }, { origin: 'content' });
  assert.deepEqual(Object.keys(out.data).sort(), ['saveSnippets', 'snippetLength']);
  assert.equal(Number.isInteger(out.data.snippetLength), true);
});

test('content origin: a missing or junk snippetLength is reported as the default', async () => {
  for (const bad of [undefined, 'x', 9999, null]) {
    const { handle } = setup({ saveSnippets: true, snippetLength: bad });
    const res = await handle({ type: MSG.GET_SETTINGS }, { origin: 'content' });
    const n = res.data.snippetLength;
    assert.ok(Number.isInteger(n) && n >= 35 && n <= 280, String(bad));
  }
});

test('extension origin: GET_SETTINGS returns snippetLength too', async () => {
  const { handle } = setup({ saveSnippets: true, snippetLength: 77 });
  assert.deepEqual((await handle({ type: MSG.GET_SETTINGS })).data, {
    saveSnippets: true,
    snippetLength: 77,
  });
});

test('SET_SETTINGS validates snippetLength and rejects unknown junk', async () => {
  const { handle, calls } = setup();
  for (const bad of ['60', 34, 281, 60.5, NaN, null, true, {}]) {
    const res = await handle({ type: MSG.SET_SETTINGS, payload: { snippetLength: bad } });
    assert.deepEqual(res, { ok: false, error: 'bad_payload' }, String(bad));
  }
  assert.equal(
    calls.some((c) => c[0] === 'setSettings'),
    false,
  );
  for (const ok of [35, 36, 140, 280]) {
    const res = await handle({ type: MSG.SET_SETTINGS, payload: { snippetLength: ok, x: 1 } });
    assert.equal(res.ok, true);
    assert.deepEqual(calls.at(-1), ['setSettings', { snippetLength: ok }]);
  }
});

test('the snippet gate hands the repository the current length (0 when off)', async () => {
  const on = setup({ saveSnippets: true, snippetLength: 40 });
  await on.handle({ type: MSG.SAVE_POST, payload: { url: 'u', textPreview: 'x' } });
  assert.equal(await on.calls[0][2].allowPreview(), 40);
  const off = setup({ saveSnippets: false, snippetLength: 40 });
  await off.handle({ type: MSG.SAVE_POST, payload: { url: 'u', textPreview: 'x' } });
  assert.equal(await off.calls[0][2].allowPreview(), 0);
  const old = setup({ saveSnippets: true });
  await old.handle({ type: MSG.SAVE_POST, payload: { url: 'u', textPreview: 'x' } });
  assert.equal(await old.calls[0][2].allowPreview(), 280);
});

test('content origin: SAVE_POST response is reduced to id and folder_id', async () => {
  const { handle } = setup({
    repoOverrides: {
      savePost: async () => ({ id: 'p9', folder_id: 'f1', url: 'u', notes: 'secret', tags: ['t'] }),
    },
  });
  const msg = { type: MSG.SAVE_POST, payload: { url: 'https://x.com/a/status/1' } };
  assert.deepEqual((await handle(msg, { origin: 'content' })).data, { id: 'p9', folder_id: 'f1' });
  assert.equal((await handle(msg, { origin: 'extension' })).data.notes, 'secret');
  assert.equal((await handle(msg)).data.notes, 'secret');
});

test('origin defaults to content (fail closed) when omitted', async () => {
  const { raw } = setup();
  const res = await raw({ type: MSG.SAVE_POST, payload: { url: 'https://x.com/a/status/1' } });
  assert.deepEqual(res.data, { id: 'p1', folder_id: null });
});

test('content origin: LIST_FOLDERS returns only id and name', async () => {
  const { handle } = setup({
    repoOverrides: {
      listFolders: async () => [
        { id: 'f1', name: 'Reading', created_at: 'x', updated_at: 'y', deleted: false },
      ],
    },
  });
  const res = await handle({ type: MSG.LIST_FOLDERS }, { origin: 'content' });
  assert.deepEqual(res.data, [{ id: 'f1', name: 'Reading' }]);
  assert.equal((await handle({ type: MSG.LIST_FOLDERS })).data[0].created_at, 'x');
});

test('DELETE_ALL_DATA clears the library and the settings', async () => {
  const { handle, calls } = setup();
  assert.deepEqual(await handle({ type: MSG.DELETE_ALL_DATA }), { ok: true });
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['clearAll', 'settingsClear'],
  );
});

test('EXPORT_DATA returns the compact JSON library string', async () => {
  const { handle } = setup();
  const res = await handle({ type: MSG.EXPORT_DATA });
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(res.data), {
    version: 1,
    exported_at: '2026-11-21T10:00:00.000Z',
    folders: [],
    posts: [],
  });
  assert.equal(res.data.includes('\n  '), false);
});

test('IMPORT_DATA parses text, merges through the repository and returns the summary', async () => {
  const { handle, calls } = setup();
  const text = JSON.stringify({
    version: 1,
    folders: [],
    posts: [{ id: 'z', url: 'https://x.com/a/status/9' }, 3],
  });
  const res = await handle({ type: MSG.IMPORT_DATA, payload: { text } });
  assert.deepEqual(res, {
    ok: true,
    data: {
      added: 1,
      updated: 0,
      removed: 0,
      unchanged: 2,
      foldersChanged: 0,
      merged: 0,
      rejected: 1,
      valid: 1,
    },
  });
  assert.equal(calls[0][0], 'importDoc');
  assert.equal(calls[0][2].exportedAt, null);
  assert.equal(calls[0][1].posts[0].id, 'z');
});

test('IMPORT_DATA rejects bad payloads and unparseable files without touching data', async () => {
  const { handle, calls } = setup();
  assert.deepEqual(await handle({ type: MSG.IMPORT_DATA, payload: { text: 5 } }), {
    ok: false,
    error: 'bad_payload',
  });
  assert.deepEqual(await handle({ type: MSG.IMPORT_DATA }), { ok: false, error: 'bad_payload' });
  assert.deepEqual(await handle({ type: MSG.IMPORT_DATA, payload: { text: 'nope' } }), {
    ok: false,
    error: 'InvalidImportError',
  });
  assert.equal(calls.length, 0);
});

test('IMPORT_DATA passes dryRun through and rejects a non-boolean dryRun', async () => {
  const { handle, calls } = setup();
  const text = JSON.stringify({ version: 1, folders: [], posts: [] });
  const res = await handle({ type: MSG.IMPORT_DATA, payload: { text, dryRun: true } });
  assert.equal(res.ok, true);
  assert.equal(calls[0][2].dryRun, true);
  const real = await handle({ type: MSG.IMPORT_DATA, payload: { text } });
  assert.equal(real.ok, true);
  assert.equal(calls[1][2].dryRun, false);
  assert.deepEqual(await handle({ type: MSG.IMPORT_DATA, payload: { text, dryRun: 'yes' } }), {
    ok: false,
    error: 'bad_payload',
  });
});

test('FolderNameTakenError keeps its own code', async () => {
  const { FolderNameTakenError } = await import('../../src/core/errors.js');
  const { handle } = setup({
    repoOverrides: {
      createFolder: async () => {
        throw new FolderNameTakenError('x');
      },
    },
  });
  assert.deepEqual(await handle({ type: MSG.CREATE_FOLDER, payload: { name: 'A' } }), {
    ok: false,
    error: 'FolderNameTakenError',
  });
});
