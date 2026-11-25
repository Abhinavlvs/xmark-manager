import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageGuard } from '../../src/background/guard.js';
import { MSG } from '../../src/platform/messages.js';

const ID = 'ext@id';
const guard = createMessageGuard({ extensionId: ID, extensionOrigin: 'moz-extension://abc/' });
const EXT = `moz-extension://abc/popup.html`;
const own = { id: ID, url: EXT };
const optionsTab = { id: ID, url: 'moz-extension://abc/options.html', tab: { incognito: false } };
const tab = (url = 'https://x.com/a', incognito = false) => ({
  id: ID,
  url,
  tab: { incognito },
});

test('allows own-extension messages', () => {
  assert.equal(guard({ type: MSG.LIST_POSTS }, own).allowed, true);
  assert.equal(guard({ type: MSG.SAVE_POST, payload: {} }, own).allowed, true);
});

test('rejects foreign sender id', () => {
  assert.equal(guard({ type: MSG.LIST_POSTS }, { id: 'evil' }).allowed, false);
  assert.equal(guard({ type: MSG.LIST_POSTS }, undefined).allowed, false);
});

test('rejects unknown and non-object messages', () => {
  for (const m of [null, 'x', 5, [], {}, { type: 'NOPE' }, { type: 5 }]) {
    assert.equal(guard(m, own).allowed, false);
  }
});

test('content script limited to SAVE_POST, LIST_FOLDERS, GET_SETTINGS and OPEN_FOLDER_SETTINGS', () => {
  const allowed = [MSG.SAVE_POST, MSG.LIST_FOLDERS, MSG.GET_SETTINGS, MSG.OPEN_FOLDER_SETTINGS];
  for (const type of allowed) assert.equal(guard({ type }, tab()).allowed, true, type);
  for (const type of Object.values(MSG).filter((t) => !allowed.includes(t))) {
    assert.equal(guard({ type }, tab()).allowed, false, type);
  }
});

test('content script must come from an https X page', () => {
  for (const u of ['https://www.x.com/a', 'https://twitter.com/a', 'https://www.twitter.com/a']) {
    assert.equal(guard({ type: MSG.SAVE_POST }, tab(u)).allowed, true, u);
  }
  for (const u of [
    'http://x.com/a',
    'https://evil.com/',
    'https://x.com.evil.com/',
    'nope',
    undefined,
  ]) {
    assert.equal(
      guard({ type: MSG.SAVE_POST }, { id: ID, url: u, tab: {} }).allowed,
      false,
      String(u),
    );
  }
});

test('rejects SAVE_POST from an incognito tab or flagged incognito', () => {
  assert.equal(guard({ type: MSG.SAVE_POST }, tab('https://x.com/a', true)).allowed, false);
  assert.equal(guard({ type: MSG.SAVE_POST, incognito: true }, own).allowed, false);
  assert.equal(guard({ type: MSG.LIST_POSTS, incognito: true }, own).allowed, true);
});

test('OPEN_FOLDER_SETTINGS is refused for private tabs, allowed from extension pages', () => {
  const m = { type: MSG.OPEN_FOLDER_SETTINGS };
  assert.equal(guard(m, tab('https://x.com/a', true)).allowed, false);
  assert.equal(guard({ ...m, incognito: true }, own).allowed, false);
  assert.equal(guard(m, own).allowed, true);
  assert.equal(guard(m, tab()).allowed, true);
});

test('extension page opened in a tab (options) may send privileged messages', () => {
  for (const type of [MSG.LIST_POSTS, MSG.DELETE_ALL_DATA]) {
    assert.equal(guard({ type }, optionsTab).allowed, true, type);
  }
});

test('popup without a tab is allowed', () => {
  assert.equal(guard({ type: MSG.DELETE_ALL_DATA }, own).allowed, true);
});

test('missing sender url is rejected, even for own id', () => {
  assert.equal(guard({ type: MSG.LIST_POSTS }, { id: ID }).allowed, false);
});

test('https x.com sender with a tab is a content script with restrictions', () => {
  assert.equal(guard({ type: MSG.DELETE_ALL_DATA }, tab()).allowed, false);
  assert.equal(guard({ type: MSG.SAVE_POST }, tab()).allowed, true);
  assert.equal(guard({ type: MSG.LIST_FOLDERS }, { id: ID, url: 'https://x.com/a' }).allowed, true);
  assert.equal(guard({ type: MSG.LIST_POSTS }, { id: ID, url: 'https://x.com/a' }).allowed, false);
});

test('foreign id is rejected for extension-page urls too', () => {
  assert.equal(guard({ type: MSG.LIST_POSTS }, { id: 'evil', url: EXT }).allowed, false);
});

test('incognito SAVE_POST rejected for extension pages in a private tab', () => {
  const priv = { ...optionsTab, tab: { incognito: true } };
  assert.equal(guard({ type: MSG.SAVE_POST }, priv).allowed, false);
});

test('guard reports the sender origin', () => {
  assert.equal(guard({ type: MSG.SAVE_POST }, tab()).origin, 'content');
  assert.equal(guard({ type: MSG.LIST_POSTS }, own).origin, 'extension');
});

test('content scripts cannot send the data export, import and storage-status messages', () => {
  const types = [
    MSG.EXPORT_DATA,
    MSG.IMPORT_DATA,
    MSG.GET_STORAGE_STATUS,
    MSG.EXPORT_QUARANTINE,
    MSG.DISCARD_QUARANTINE,
  ];
  for (const type of types) {
    assert.equal(guard({ type }, tab()).allowed, false, type);
    assert.equal(guard({ type }, { id: ID, url: 'https://twitter.com/a' }).allowed, false, type);
    assert.equal(guard({ type }, optionsTab).allowed, true, type);
  }
});
