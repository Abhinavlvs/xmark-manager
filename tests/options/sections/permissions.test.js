import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, click, settle, textOf } from '../../../test-support/dom.js';
import { createPermissionsSection, X_ORIGINS } from '../../../src/options/sections/permissions.js';

async function setup({
  granted = false,
  requestResult = true,
  containsThrows = false,
  requestThrows = false,
} = {}) {
  const ctx = makeDom();
  const calls = [];
  let has = granted;
  const permissions = {
    contains: async (origins) => {
      calls.push(['contains', origins]);
      if (containsThrows) throw new Error('nope');
      return has;
    },
    request: (origins) => {
      calls.push(['request', origins]);
      if (requestThrows) return Promise.reject(new Error('x'));
      has = requestResult;
      return Promise.resolve(requestResult);
    },
  };
  const said = [];
  const section = createPermissionsSection(ctx.dom, { permissions, announce: (t) => said.push(t) });
  ctx.document.body.append(section.element);
  await section.load();
  const button = () =>
    [...section.element.querySelectorAll('button')].find((b) => b.textContent === 'Enable on X');
  return { ...ctx, calls, said, section, button };
}

test('asks about both x.com and twitter.com', () => {
  assert.deepEqual(X_ORIGINS, ['*://x.com/*', '*://twitter.com/*']);
});

test('granted: shows the enabled state and no button', async () => {
  const { section, button } = await setup({ granted: true });
  assert.match(textOf(section.element), /Access to x\.com and twitter\.com is on/);
  assert.equal(button().hidden, true);
});

test('missing: explains why and offers the button; the popup note is present', async () => {
  const { section, button } = await setup();
  assert.match(textOf(section.element), /Access to x\.com and twitter\.com is off/);
  assert.match(textOf(section.element), /Save button on the page/);
  assert.match(textOf(section.element), /popup works without it/);
  assert.equal(button().hidden, false);
});

test('permissions.request is called synchronously inside the click handler', async () => {
  const { window, button, calls, said, section } = await setup();
  click(window, button());
  assert.deepEqual(calls.at(-1), ['request', X_ORIGINS]);
  await settle();
  assert.match(textOf(section.element), /is on/);
  assert.deepEqual(said, ['Access to x.com and twitter.com is now on.']);
});

test('a refused request keeps the button and says so calmly', async () => {
  const { window, button, section } = await setup({ requestResult: false });
  click(window, button());
  await settle();
  assert.equal(button().hidden, false);
  assert.match(textOf(section.element), /was not granted/);
});

test('API errors show the about:addons fallback as plain text', async () => {
  for (const opts of [{ containsThrows: true }, { requestThrows: true }]) {
    const { window, button, section } = await setup(opts);
    if (opts.requestThrows) {
      click(window, button());
      await settle();
    }
    assert.match(textOf(section.element), /about:addons/);
    assert.match(textOf(section.element), /Permissions/);
    assert.equal(section.element.querySelector('a'), null);
  }
});
