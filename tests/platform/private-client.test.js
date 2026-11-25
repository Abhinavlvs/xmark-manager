import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateAwareClient } from '../../src/platform/private-client.js';

// popup.js and options.js both build their runtime client here, so the private flag cannot diverge.
function fakeApi({
  context = false,
  tabIncognito = false,
  tabUrl = 'https://x.com/a/status/1',
} = {}) {
  const sent = [];
  return {
    sent,
    runtime: {
      sendMessage: async (m) => {
        sent.push(m);
        return { ok: true, data: 1 };
      },
    },
    tabs: { query: async () => [{ url: tabUrl, incognito: tabIncognito }] },
    extension: { inIncognitoContext: context },
  };
}

test('flag is false when neither the context nor the active tab is private', async () => {
  const api = fakeApi();
  const { client } = await createPrivateAwareClient(api);
  await client.request('LIST_FOLDERS');
  assert.equal(api.sent[0].incognito, false);
});

test('flag is true when only the extension context is private', async () => {
  const api = fakeApi({ context: true });
  await (await createPrivateAwareClient(api)).client.request('X');
  assert.equal(api.sent[0].incognito, true);
});

test('flag is true when only the active tab is private (Safari extension pages)', async () => {
  const api = fakeApi({ tabIncognito: true });
  await (await createPrivateAwareClient(api)).client.request('X');
  assert.equal(api.sent[0].incognito, true);
});

test('the tab is returned for callers that need its url', async () => {
  const { tab } = await createPrivateAwareClient(fakeApi({ tabUrl: 'https://x.com/h' }));
  assert.equal(tab.url, 'https://x.com/h');
});
