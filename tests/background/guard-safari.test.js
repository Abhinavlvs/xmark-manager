import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageGuard } from '../../src/background/guard.js';
import { MSG } from '../../src/platform/messages.js';

// Real Safari shape: runtime.getURL('') is safari-web-extension://<UPPERCASE-UUID>/ as seen in
// https://bugs.webkit.org/show_bug.cgi?id=256054 and https://developer.apple.com/forums/thread/670165.
// Not yet observed on a device by the maintainers (UNVERIFIED at runtime).
const ID = 'ext@id';
const UUID = '5107FF07-6DB1-4907-BCAB-D84EB6E2655E';
const ORIGIN = `safari-web-extension://${UUID}/`;
const guard = createMessageGuard({ extensionId: ID, extensionOrigin: ORIGIN });
const page = (url, tab) => ({ id: ID, url, ...(tab ? { tab } : {}) });

test('own Safari extension pages are recognised', () => {
  assert.equal(guard({ type: MSG.LIST_POSTS }, page(`${ORIGIN}popup/popup.html`)).allowed, true);
  assert.equal(
    guard({ type: MSG.EXPORT_DATA }, page(`${ORIGIN}options/options.html`)).allowed,
    true,
  );
});

test('another extension UUID or a lookalike host is not an extension page', () => {
  const other = 'safari-web-extension://00000000-0000-0000-0000-000000000000/popup.html';
  assert.equal(guard({ type: MSG.LIST_POSTS }, page(other)).allowed, false);
  const evil = `safari-web-extension://${UUID}.evil.example/popup.html`;
  assert.equal(guard({ type: MSG.LIST_POSTS }, page(evil)).allowed, false);
});

test('saves from a private tab or a private popup are refused on the Safari origin too', () => {
  const viaTab = page(`${ORIGIN}popup.html`, { incognito: true });
  assert.equal(guard({ type: MSG.SAVE_POST, payload: {} }, viaTab).allowed, false);
  const viaFlag = page(`${ORIGIN}popup.html`);
  assert.equal(
    guard({ type: MSG.SAVE_POST, payload: {}, incognito: true }, viaFlag).allowed,
    false,
  );
});

test('the guard fails closed for a getURL that is not an extension origin', () => {
  for (const bad of [
    '',
    'https://x.com/',
    'safari-web-extension://',
    'safari-web-extension://id',
  ]) {
    assert.throws(() => createMessageGuard({ extensionId: ID, extensionOrigin: bad }));
  }
});
