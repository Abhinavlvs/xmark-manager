import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeDom, fakeClient, fire, settle, textOf } from '../../../test-support/dom.js';
import { MSG } from '../../../src/platform/messages.js';
import { RequestError } from '../../../src/platform/runtime-client.js';
import { createPrivacySection } from '../../../src/options/sections/privacy.js';
import { PRIVACY_FACTS } from '../../../src/options/privacy-copy.js';

async function setup(routes = {}, saveSnippets = false) {
  const ctx = makeDom();
  const said = [];
  const client = fakeClient({ [MSG.GET_SETTINGS]: { saveSnippets }, ...routes });
  const section = createPrivacySection(ctx.dom, { client, announce: (t) => said.push(t) });
  ctx.document.body.append(section.element);
  await section.load();
  const toggle = section.element.querySelector('input[type="checkbox"]');
  return { ...ctx, said, client, section, toggle };
}

test('the snippet toggle reflects the stored setting and is off by default', async () => {
  assert.equal((await setup()).toggle.checked, false);
  assert.equal((await setup({}, true)).toggle.checked, true);
  assert.equal((await setup()).toggle.getAttribute('role'), 'switch');
});

test('toggling saves the setting and announces it', async () => {
  const { window, toggle, client, said } = await setup();
  toggle.checked = true;
  fire(window, toggle, 'change');
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.SET_SETTINGS).payload, {
    saveSnippets: true,
  });
  assert.deepEqual(said, ['Text snippets are on.']);
  toggle.checked = false;
  fire(window, toggle, 'change');
  await settle();
  assert.deepEqual(said.at(-1), 'Text snippets are off.');
});

test('a failed save reverts the toggle and shows an alert', async () => {
  const { window, toggle, section } = await setup({
    [MSG.SET_SETTINGS]: () => {
      throw new RequestError('internal_error');
    },
  });
  toggle.checked = true;
  fire(window, toggle, 'change');
  await settle();
  assert.equal(toggle.checked, false);
  assert.equal(section.element.querySelector('[role="alert"]').hidden, false);
});

test('explains what the snippet stores and where', async () => {
  const { section } = await setup();
  const text = textOf(section.element);
  assert.match(text, /first 35 to 280 characters \(you choose; default 280\)/);
  assert.match(text, /only when you save from the on-page button/);
  assert.match(text, /stored only in this browser/i);
});

test('every fact states a sentence that PRIVACY.md also states', async () => {
  const policy = (await readFile(new URL('../../../PRIVACY.md', import.meta.url), 'utf8'))
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ');
  for (const fact of PRIVACY_FACTS) {
    assert.ok(policy.includes(fact.quote), `PRIVACY.md lacks: ${fact.quote}`);
  }
});

test('the facts list renders as text and does not claim more isolation than the policy', async () => {
  const { section } = await setup();
  const items = [...section.element.querySelectorAll('.facts li')].map(textOf);
  assert.equal(items.length, PRIVACY_FACTS.length);
  assert.match(textOf(section.element), /observe keystrokes/);
  assert.doesNotMatch(textOf(section.element), /cannot be read|fully isolated|completely/i);
});

test('the read-timing wording names the on-page Save button, not the panel Save', async () => {
  const policy = await readFile(new URL('../../../PRIVACY.md', import.meta.url), 'utf8');
  const read = PRIVACY_FACTS.find((f) => f.label === 'What is read');
  const precise =
    'It reads a post only when you click the Save button on that post (this opens the panel), and only that one post. Nothing is stored until you press Save in the panel.';
  assert.ok(read.text.startsWith(precise));
  assert.match(read.text, /does not scan timelines/);
  assert.ok(policy.includes(precise));
  assert.doesNotMatch(policy, /only when you click Save on one specific post/);
  assert.doesNotMatch(policy, /Precisely:/);
});
