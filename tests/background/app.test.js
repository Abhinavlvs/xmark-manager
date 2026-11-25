import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/background/app.js';
import { MSG } from '../../src/platform/messages.js';

function memoryArea(delayMs = 0) {
  const data = {};
  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : undefined);
  return {
    get: async (k) => {
      await wait();
      return typeof k === 'string' ? { [k]: data[k] } : { ...data };
    },
    set: async (o) => {
      await wait();
      Object.assign(data, structuredClone(o));
    },
    remove: async (k) => [].concat(k).forEach((x) => delete data[x]),
    clear: async () => Object.keys(data).forEach((x) => delete data[x]),
  };
}

const ID = 'ext@id';
const app = (delayMs = 0) =>
  buildApp({
    browserApi: {
      storage: { local: memoryArea(delayMs) },
      runtime: { id: ID, getURL: () => 'moz-extension://abc/' },
    },
  });
const contentSender = { id: ID, url: 'https://x.com/home', tab: { incognito: false } };
const popupSender = { id: ID, url: 'moz-extension://abc/popup.html' };

test('content-script SAVE_POST response is reduced, popup keeps the record', async () => {
  const onMessage = app();
  const msg = { type: MSG.SAVE_POST, payload: { url: 'https://x.com/a/status/1', notes: 'n' } };
  const fromContent = await onMessage(msg, contentSender);
  assert.equal(fromContent.ok, true);
  assert.deepEqual(Object.keys(fromContent.data).sort(), ['folder_id', 'id']);
  const fromPopup = await onMessage(
    { type: MSG.SAVE_POST, payload: { url: 'https://x.com/a/status/2', notes: 'n' } },
    popupSender,
  );
  assert.equal(fromPopup.data.notes, 'n');
});

test('content-script GET_SETTINGS exposes only saveSnippets and snippetLength', async () => {
  const res = await app()({ type: MSG.GET_SETTINGS }, contentSender);
  assert.deepEqual(Object.keys(res.data).sort(), ['saveSnippets', 'snippetLength']);
  assert.equal(res.data.snippetLength, 280);
});

test('a client sending 280 characters while the setting is 60 stores 60', async () => {
  const onMessage = app();
  await onMessage(
    { type: MSG.SET_SETTINGS, payload: { saveSnippets: true, snippetLength: 60 } },
    popupSender,
  );
  await onMessage(
    {
      type: MSG.SAVE_POST,
      payload: { url: 'https://x.com/a/status/7', textPreview: 'z'.repeat(280) },
    },
    contentSender,
  );
  const posts = (await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data;
  assert.equal(posts[0].text_preview, 'z'.repeat(60));
  const res = await onMessage(
    { type: MSG.SET_SETTINGS, payload: { snippetLength: 999 } },
    contentSender,
  );
  assert.equal(res.ok, false, 'content scripts cannot change settings');
});

test('content script cannot list posts', async () => {
  const res = await app()({ type: MSG.LIST_POSTS }, contentSender);
  assert.deepEqual(res, { ok: false, error: 'rejected' });
});

test('export, import and delete-all work end to end and clear settings', async () => {
  const onMessage = app();
  await onMessage(
    { type: MSG.SAVE_POST, payload: { url: 'https://x.com/a/status/1' } },
    popupSender,
  );
  await onMessage(
    { type: MSG.SET_SETTINGS, payload: { saveSnippets: true, snippetLength: 90 } },
    popupSender,
  );
  const exported = (await onMessage({ type: MSG.EXPORT_DATA }, popupSender)).data;
  assert.doesNotMatch(exported, /snippetLength|saveSnippets/, 'settings are not exported');
  const first = await onMessage(
    { type: MSG.IMPORT_DATA, payload: { text: exported } },
    popupSender,
  );
  assert.deepEqual(first.data, {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 1,
    foldersChanged: 0,
    keptLocal: 0,
    keptLocalFolders: 0,
    merged: 0,
    rejected: 0,
    valid: 1,
  });
  await onMessage({ type: MSG.DELETE_ALL_DATA }, popupSender);
  assert.deepEqual((await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data, []);
  assert.deepEqual((await onMessage({ type: MSG.GET_SETTINGS }, popupSender)).data, {
    saveSnippets: false,
    snippetLength: 280,
  });
  const again = await onMessage(
    { type: MSG.IMPORT_DATA, payload: { text: exported } },
    popupSender,
  );
  assert.equal(again.data.added, 1);
  const twice = await onMessage(
    { type: MSG.IMPORT_DATA, payload: { text: exported } },
    popupSender,
  );
  assert.deepEqual(twice.data, {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 1,
    foldersChanged: 0,
    keptLocal: 0,
    keptLocalFolders: 0,
    merged: 0,
    rejected: 0,
    valid: 1,
  });
});

test('delete-all waits for in-flight saves and imports; nothing reappears', async () => {
  const onMessage = app(20);
  const save = (n) =>
    onMessage(
      { type: MSG.SAVE_POST, payload: { url: `https://x.com/a/status/${n}` } },
      popupSender,
    );
  const text = JSON.stringify({
    version: 1,
    folders: [],
    posts: [{ id: 'z', url: 'https://x.com/b/status/9' }],
  });
  const inFlight = [
    save(1),
    onMessage({ type: MSG.IMPORT_DATA, payload: { text } }, popupSender),
    save(2),
  ];
  const cleared = await onMessage({ type: MSG.DELETE_ALL_DATA }, popupSender);
  await Promise.all(inFlight);
  assert.equal(cleared.ok, true);
  assert.deepEqual((await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data, []);
});

test('dry-run import changes nothing; the real import then applies it', async () => {
  const onMessage = app();
  const text = JSON.stringify({
    version: 1,
    folders: [],
    posts: [{ id: 'z', url: 'https://x.com/b/status/9' }],
  });
  const dry = await onMessage(
    { type: MSG.IMPORT_DATA, payload: { text, dryRun: true } },
    popupSender,
  );
  assert.equal(dry.data.added, 1);
  assert.deepEqual((await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data, []);
  await onMessage({ type: MSG.IMPORT_DATA, payload: { text } }, popupSender);
  assert.equal((await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data.length, 1);
});

test('a save sent before delete-all cannot outlive it, even against slow storage', async () => {
  const onMessage = app(5);
  const save = onMessage(
    { type: MSG.SAVE_POST, payload: { url: 'https://x.com/a/status/1', textPreview: 'x' } },
    popupSender,
  );
  const update = onMessage(
    { type: MSG.UPDATE_POST, payload: { id: 'nope', patch: { notes: 'n' } } },
    popupSender,
  );
  const cleared = onMessage({ type: MSG.DELETE_ALL_DATA }, popupSender);
  await Promise.all([save, update, cleared]);
  assert.deepEqual((await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data, []);
});

test('a settings change sent before delete-all is wiped; one sent after it survives', async () => {
  const onMessage = app(5);
  const set = (on) =>
    onMessage({ type: MSG.SET_SETTINGS, payload: { saveSnippets: on } }, popupSender);
  const del = () => onMessage({ type: MSG.DELETE_ALL_DATA }, popupSender);
  await Promise.all([set(true), del()]);
  assert.equal((await onMessage({ type: MSG.GET_SETTINGS }, popupSender)).data.saveSnippets, false);
  await Promise.all([del(), set(true)]);
  assert.equal((await onMessage({ type: MSG.GET_SETTINGS }, popupSender)).data.saveSnippets, true);
});

test('text snippets are stored only while the setting is on', async () => {
  const onMessage = app(5);
  const save = (n) =>
    onMessage(
      { type: MSG.SAVE_POST, payload: { url: `https://x.com/a/status/${n}`, textPreview: 'hi' } },
      popupSender,
    );
  await save(1);
  await onMessage({ type: MSG.SET_SETTINGS, payload: { saveSnippets: true } }, popupSender);
  await save(2);
  const posts = (await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data;
  const preview = (n) => posts.find((p) => p.url.endsWith(`/${n}`)).text_preview;
  assert.deepEqual([preview(1), preview(2)], ['', 'hi']);
});

test('a smaller length never shortens saved or imported snippets (no retroactive cut)', async () => {
  const onMessage = app();
  const long = 'q'.repeat(280);
  await onMessage(
    { type: MSG.SET_SETTINGS, payload: { saveSnippets: true, snippetLength: 280 } },
    popupSender,
  );
  await onMessage(
    { type: MSG.SAVE_POST, payload: { url: 'https://x.com/a/status/8', textPreview: long } },
    contentSender,
  );
  const exported = (await onMessage({ type: MSG.EXPORT_DATA }, popupSender)).data;
  await onMessage({ type: MSG.SET_SETTINGS, payload: { snippetLength: 35 } }, popupSender);
  let posts = (await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data;
  assert.equal(posts[0].text_preview, long, 'stored snippet is kept as saved');
  await onMessage({ type: MSG.DELETE_ALL_DATA }, popupSender);
  await onMessage(
    { type: MSG.SET_SETTINGS, payload: { saveSnippets: true, snippetLength: 35 } },
    popupSender,
  );
  const res = await onMessage({ type: MSG.IMPORT_DATA, payload: { text: exported } }, popupSender);
  assert.equal(res.ok, true);
  posts = (await onMessage({ type: MSG.LIST_POSTS }, popupSender)).data;
  assert.equal(posts[0].text_preview, long, 'import keeps the exported snippet');
});
