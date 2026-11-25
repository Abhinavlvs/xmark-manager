import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readActiveTab, isPrivate } from '../../src/platform/active-tab.js';
import { getBrowserApi } from '../../src/platform/browser-api.js';
import { promiseBrowser, callbackChrome } from '../../test-support/browser-fakes.js';

const tabsReturning = (tab) => ({ query: async () => (tab ? [tab] : []) });

test('readActiveTab returns the url and incognito flag of the active tab', async () => {
  const tabs = tabsReturning({ url: 'https://x.com/a/status/1', incognito: true });
  assert.deepEqual(await readActiveTab(tabs), { url: 'https://x.com/a/status/1', incognito: true });
});

test('readActiveTab is safe: no tab, odd values and failures give empty, non-private defaults', async () => {
  const empty = { url: '', incognito: false };
  assert.deepEqual(await readActiveTab(tabsReturning(null)), empty);
  assert.deepEqual(await readActiveTab(tabsReturning({ url: 5, incognito: 'yes' })), empty);
  const failing = {
    query: async () => {
      throw new Error('x');
    },
  };
  assert.deepEqual(await readActiveTab(failing), empty);
});

test('isPrivate is true when either the context or the active tab is private', () => {
  assert.equal(isPrivate({ inIncognitoContext: false }, { incognito: false }), false);
  assert.equal(isPrivate({ inIncognitoContext: true }, { incognito: false }), true);
  // Safari: extension pages always report false, only the tab flag knows.
  assert.equal(isPrivate({ inIncognitoContext: false }, { incognito: true }), true);
  assert.equal(isPrivate({}, {}), false);
});

for (const [name, raw] of [
  ['promise browser', { browser: promiseBrowser() }],
  ['callback chrome', { chrome: callbackChrome() }],
]) {
  test(`${name}: derivation works through the adapter`, async () => {
    const api = getBrowserApi(raw);
    api.tabs.query = async () => [{ url: 'https://x.com/', incognito: true }];
    const tab = await readActiveTab(api.tabs);
    assert.equal(isPrivate(api.extension, tab), true);
  });
}
