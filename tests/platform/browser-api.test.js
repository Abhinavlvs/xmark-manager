import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBrowserApi } from '../../src/platform/browser-api.js';
import { promiseBrowser, callbackChrome, deliver } from '../../test-support/browser-fakes.js';

const flavours = {
  'promise browser (Firefox/Safari)': () => {
    const raw = promiseBrowser();
    return { raw, globalObj: { browser: raw } };
  },
  'callback chrome (Chrome)': () => {
    const raw = callbackChrome();
    return { raw, globalObj: { chrome: raw } };
  },
};

for (const [name, make] of Object.entries(flavours)) {
  test(`${name}: the used APIs all return promises`, async () => {
    const api = getBrowserApi(make().globalObj);
    assert.equal(api.runtime.id, 'ext@id');
    assert.equal(api.runtime.getManifest().version, '9.9.9');
    assert.match(api.runtime.getURL('a.html'), /a\.html$/);
    assert.deepEqual(await api.runtime.sendMessage({ a: 1 }), { echoed: { a: 1 } });
    assert.equal(await api.runtime.openOptionsPage(), undefined);
    await api.storage.local.set({ k: 1, j: 2 });
    assert.deepEqual(await api.storage.local.get('k'), { k: 1 });
    await api.storage.local.remove(['k']);
    assert.deepEqual(await api.storage.local.get('k'), { k: undefined });
    assert.equal((await api.tabs.query({ active: true }))[0].url, 'https://x.com/');
    assert.equal((await api.tabs.create({ url: 'u' })).url, 'u');
    assert.equal(await api.permissions.contains({ origins: ['a'] }), true);
    assert.equal(await api.permissions.request({ origins: ['a'] }), true);
    assert.equal(typeof api.extension.inIncognitoContext, 'boolean');
  });

  test(`${name}: a promise-returning listener answers the sender`, async () => {
    const { raw, globalObj } = make();
    const api = getBrowserApi(globalObj);
    api.runtime.onMessage.addListener(async (m, sender) => ({ got: m, from: sender.id }));
    assert.deepEqual(await deliver(raw, 'hi'), { got: 'hi', from: 'ext@id' });
  });
}

test('chrome flavour: lastError rejects the promise, once per call', async () => {
  const chrome = callbackChrome();
  const api = getBrowserApi({ chrome });
  chrome.state.failNext = 'boom';
  await assert.rejects(api.runtime.sendMessage({}), /boom/);
  assert.deepEqual(await api.runtime.sendMessage(1), { echoed: 1 });
});

test('chrome flavour: a promise result is answered through sendResponse and held open', async () => {
  const chrome = callbackChrome();
  getBrowserApi({ chrome }).runtime.onMessage.addListener(async () => ({ ok: true }));
  let sent;
  assert.equal(
    chrome.runtime.onMessage.listeners[0]('m', {}, (r) => (sent = r)),
    true,
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(sent, { ok: true });
});

test('chrome flavour: a sync non-promise listener result is not held open', () => {
  const chrome = callbackChrome();
  getBrowserApi({ chrome }).runtime.onMessage.addListener(() => undefined);
  assert.equal(
    chrome.runtime.onMessage.listeners[0]('m', {}, () => {}),
    false,
  );
});

for (const [name, make] of Object.entries(flavours)) {
  test(`${name}: a rejected promise answers undefined exactly once`, async () => {
    const { raw, globalObj } = make();
    getBrowserApi(globalObj).runtime.onMessage.addListener(async () => {
      throw new Error('x');
    });
    const sent = [];
    const [wrapper] = raw.runtime.onMessage.listeners;
    assert.equal(
      wrapper('m', {}, (r) => sent.push(r)),
      true,
    );
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(sent, [undefined]);
  });

  test(`${name}: a synchronous throw answers nothing and does not hold the channel open`, () => {
    const { raw, globalObj } = make();
    getBrowserApi(globalObj).runtime.onMessage.addListener(() => {
      throw new Error('y');
    });
    const sent = [];
    assert.equal(
      raw.runtime.onMessage.listeners[0]('m', {}, (r) => sent.push(r)),
      false,
    );
    assert.deepEqual(sent, []);
  });

  test(`${name}: listeners are wrapped identically (no reliance on promise-listener support)`, async () => {
    const { raw, globalObj } = make();
    const fn = async () => 1;
    getBrowserApi(globalObj).runtime.onMessage.addListener(fn);
    assert.notEqual(raw.runtime.onMessage.listeners[0], fn);
    const sent = [];
    assert.equal(
      raw.runtime.onMessage.listeners[0]('m', {}, (r) => sent.push(r)),
      true,
    );
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(sent, [1]);
  });
}

test('chrome flavour: removeListener removes the wrapper', () => {
  const chrome = callbackChrome();
  const api = getBrowserApi({ chrome });
  const fn = async () => 1;
  api.runtime.onMessage.addListener(fn);
  assert.equal(chrome.runtime.onMessage.listeners.length, 1);
  api.runtime.onMessage.removeListener(fn);
  assert.equal(chrome.runtime.onMessage.listeners.length, 0);
});

test('browser wins over chrome (Chrome 148+ exposes both); neither throws a clear error', async () => {
  const browser = promiseBrowser();
  const chrome = callbackChrome();
  chrome.state.failNext = 'would reject if chrome were used';
  assert.deepEqual(await getBrowserApi({ browser, chrome }).runtime.sendMessage(1), { echoed: 1 });
  assert.throws(() => getBrowserApi({}), /no WebExtension API/);
});

test('no global state: two calls give independent facades', () => {
  const chrome = callbackChrome();
  assert.notEqual(getBrowserApi({ chrome }), getBrowserApi({ chrome }));
});
