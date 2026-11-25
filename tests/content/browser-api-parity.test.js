import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, resetContent } from '../../test-support/content.js';
import { getBrowserApi } from '../../src/platform/browser-api.js';
import { promiseBrowser, callbackChrome } from '../../test-support/browser-fakes.js';

afterEach(resetContent);

// The classic content script cannot import the module adapter, so it carries an inline copy.
// Both must behave identically for what content scripts use: runtime.id and runtime.sendMessage.
async function inline() {
  const { xmark } = await loadContent(['messages.js']);
  return xmark.getBrowserApi;
}

const cases = {
  'promise browser': () => ({ browser: promiseBrowser() }),
  'callback chrome': () => ({ chrome: callbackChrome() }),
  'both present': () => ({ browser: promiseBrowser(), chrome: callbackChrome() }),
};

for (const [name, make] of Object.entries(cases)) {
  test(`inline copy matches the module adapter: ${name}`, async () => {
    const copy = await inline();
    const a = getBrowserApi(make());
    const b = copy(make());
    assert.equal(b.runtime.id, a.runtime.id);
    assert.deepEqual(await b.runtime.sendMessage({ x: 1 }), await a.runtime.sendMessage({ x: 1 }));
  });
}

test('inline copy rejects on lastError like the module adapter', async () => {
  const copy = await inline();
  for (const get of [getBrowserApi, copy]) {
    const chrome = callbackChrome();
    chrome.state.failNext = 'boom';
    await assert.rejects(get({ chrome }).runtime.sendMessage({}), /boom/);
  }
});

test('inline copy throws the same way when no API exists', async () => {
  const copy = await inline();
  assert.throws(() => getBrowserApi({}), /no WebExtension API/);
  assert.throws(() => copy({}), /no WebExtension API/);
});

test('content send() works through a Chrome-style callback API', async () => {
  const { xmark } = await loadContent(['messages.js']);
  globalThis.chrome = callbackChrome();
  try {
    assert.deepEqual(await xmark.send('LIST_FOLDERS'), {
      echoed: { type: 'LIST_FOLDERS', payload: undefined },
    });
  } finally {
    delete globalThis.chrome;
  }
});
