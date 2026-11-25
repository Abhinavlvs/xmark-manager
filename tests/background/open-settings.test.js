import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsOpener } from '../../src/background/open-settings.js';
import { buildApp } from '../../src/background/app.js';
import { MSG } from '../../src/platform/messages.js';
import { fakeArea } from '../../test-support/storage-area.js';

function opener(over = {}) {
  const created = [];
  let t = 1000;
  const open = createSettingsOpener({
    tabs: { create: async (o) => created.push(o) },
    getURL: (p) => `moz-extension://abc/${p}`,
    now: () => t,
    ...over,
  });
  return { open, created, advance: (ms) => (t += ms) };
}

test('opens the options Folders screen in a new tab', async () => {
  const { open, created } = opener();
  await open('7');
  assert.deepEqual(created, [{ url: 'moz-extension://abc/options/options.html#folders-add' }]);
});

test('one open per sender per 2 seconds; others are not blocked', async () => {
  const { open, created, advance } = opener();
  await open('7');
  await open('7');
  assert.equal(created.length, 1);
  await open('8');
  assert.equal(created.length, 2);
  advance(2000);
  await open('7');
  assert.equal(created.length, 3);
});

test('a failing tabs.create is settings_unavailable and does not start the window', async () => {
  let fail = true;
  const { open, created } = opener({
    tabs: { create: async (o) => (fail ? Promise.reject(new Error('x')) : created.push(o)) },
  });
  await assert.rejects(open('7'), { code: 'settings_unavailable' });
  fail = false;
  await open('7');
  assert.equal(created.length, 1);
});

const ID = 'ext@id';
const app = (tabs) =>
  buildApp({
    browserApi: {
      storage: { local: fakeArea() },
      runtime: { id: ID, getURL: (p) => `moz-extension://abc/${p}` },
      tabs,
    },
  });
const content = { id: ID, url: 'https://x.com/home', tab: { id: 3, incognito: false } };
const msg = (payload) => ({ type: MSG.OPEN_FOLDER_SETTINGS, payload });

test('through the app: ok for content, bad_payload with a payload, rejected when private', async () => {
  const created = [];
  const a = app({ create: async (o) => created.push(o) });
  assert.deepEqual(await a(msg(undefined), content), { ok: true });
  assert.equal(created.length, 1);
  for (const payload of [{ url: 'https://evil.example' }, 'x', [], 5]) {
    assert.deepEqual(await a(msg(payload), content), { ok: false, error: 'bad_payload' });
  }
  const priv = { ...content, tab: { id: 4, incognito: true } };
  assert.deepEqual(await a(msg(undefined), priv), { ok: false, error: 'rejected' });
  assert.equal(created.length, 1);
});

test('through the app: tabs failure maps to settings_unavailable, missing tabs too', async () => {
  const a = app({ create: async () => Promise.reject(new Error('no')) });
  assert.deepEqual(await a(msg(undefined), content), { ok: false, error: 'settings_unavailable' });
  const b = app(undefined);
  assert.deepEqual(await b(msg(undefined), content), { ok: false, error: 'settings_unavailable' });
});

test('through the app: extension pages may send it', async () => {
  const created = [];
  const a = app({ create: async (o) => created.push(o) });
  const res = await a(msg(undefined), { id: ID, url: 'moz-extension://abc/popup.html' });
  assert.deepEqual(res, { ok: true });
});
