import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageGuard } from '../../src/background/guard.js';
import { getBrowserApi } from '../../src/platform/browser-api.js';
import { MSG } from '../../src/platform/messages.js';
import { promiseBrowser, callbackChrome } from '../../test-support/browser-fakes.js';

// Every browser has its own extension URL scheme; the guard classifies pages from getURL('').
const ID = 'ext@id';
const origins = {
  firefox: 'moz-extension://abc/',
  chrome: 'chrome-extension://abc/',
  safari: 'safari-web-extension://ABC-123/',
};
const xTab = { id: ID, url: 'https://x.com/a', tab: { incognito: false } };

for (const [browser, origin] of Object.entries(origins)) {
  const guard = createMessageGuard({ extensionId: ID, extensionOrigin: origin });
  const popup = { id: ID, url: `${origin}popup/popup.html` };
  const options = { id: ID, url: `${origin}options/options.html`, tab: { incognito: false } };

  test(`${browser}: popup and options-in-tab are extension pages, content script is restricted`, () => {
    assert.equal(guard({ type: MSG.DELETE_ALL_DATA }, popup).origin, 'extension');
    assert.equal(guard({ type: MSG.EXPORT_DATA }, options).origin, 'extension');
    assert.equal(guard({ type: MSG.SAVE_POST }, xTab).origin, 'content');
    assert.equal(guard({ type: MSG.DELETE_ALL_DATA }, xTab).allowed, false);
  });

  test(`${browser}: another extension's origin, a missing url and a foreign id are rejected`, () => {
    const foreign = origin.replace('abc', 'zzz').replace('ABC-123', 'OTHER');
    const other = { id: ID, url: `${foreign}popup.html` };
    assert.equal(guard({ type: MSG.LIST_POSTS }, other).allowed, false);
    assert.equal(guard({ type: MSG.LIST_POSTS }, { id: ID }).allowed, false);
    assert.equal(guard({ type: MSG.LIST_POSTS }, { id: 'evil', url: popup.url }).allowed, false);
  });
}

test('other schemes do not count as this extension (no scheme sniffing)', () => {
  const guard = createMessageGuard({ extensionId: ID, extensionOrigin: origins.firefox });
  const sender = { id: ID, url: 'chrome-extension://abc/popup.html' };
  assert.equal(guard({ type: MSG.LIST_POSTS }, sender).allowed, false);
});

test('the guard requires a real extension origin', () => {
  for (const bad of [undefined, '', 'https://x.com/', 'moz-extension://abc']) {
    assert.throws(() => createMessageGuard({ extensionId: ID, extensionOrigin: bad }));
  }
});

test('origins taken from each fake browser getURL flow through the guard', () => {
  for (const raw of [{ browser: promiseBrowser() }, { chrome: callbackChrome() }]) {
    const api = getBrowserApi(raw);
    const guard = createMessageGuard({
      extensionId: api.runtime.id,
      extensionOrigin: api.runtime.getURL(''),
    });
    const sender = { id: api.runtime.id, url: api.runtime.getURL('popup/popup.html') };
    assert.equal(guard({ type: MSG.LIST_POSTS }, sender).origin, 'extension');
  }
});
