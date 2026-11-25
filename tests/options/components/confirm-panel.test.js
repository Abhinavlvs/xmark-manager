import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, click, press, typeInto, settle, trackFocus } from '../../../test-support/dom.js';
import { createConfirmPanel } from '../../../src/options/components/confirm-panel.js';

function setup(opts = {}) {
  const ctx = makeDom();
  const focused = trackFocus(ctx.window);
  const opener = ctx.dom.el('button', { text: 'Open', attrs: { type: 'button' } });
  const calls = [];
  const panel = createConfirmPanel(ctx.dom, {
    title: 'Sure?',
    message: 'This cannot be undone.',
    confirmLabel: 'Do it',
    onConfirm: async () => calls.push('confirm'),
    ...opts,
  });
  ctx.document.body.append(opener, panel.element);
  return { ...ctx, focused, opener, panel, calls };
}
const buttons = (panel) => [...panel.element.querySelectorAll('button')];

test('starts hidden, open shows the text and focuses Cancel', () => {
  const { panel, focused } = setup();
  assert.equal(panel.element.hidden, true);
  panel.open();
  assert.equal(panel.element.hidden, false);
  assert.match(panel.element.textContent, /Sure\?.*This cannot be undone\./);
  assert.equal(focused.at(-1).textContent, 'Cancel');
});

test('Cancel and Escape close and return focus to the opener', () => {
  const { window, panel, opener, focused } = setup();
  panel.open(opener);
  click(window, buttons(panel)[0]);
  assert.equal(panel.element.hidden, true);
  assert.equal(focused.at(-1), opener);
  panel.open(opener);
  press(window, panel.element, 'Escape');
  assert.equal(panel.element.hidden, true);
});

test('confirm runs the action, then closes', async () => {
  const { window, panel, calls, opener, focused } = setup();
  panel.open(opener);
  click(window, buttons(panel)[1]);
  await settle();
  assert.deepEqual(calls, ['confirm']);
  assert.equal(panel.element.hidden, true);
  assert.equal(focused.at(-1), opener);
});

test('failure keeps the panel open and shows an alert', async () => {
  const { window, panel } = setup({
    onConfirm: async () => {
      throw new Error('x');
    },
  });
  panel.open();
  click(window, buttons(panel)[1]);
  await settle();
  assert.equal(panel.element.hidden, false);
  assert.equal(panel.element.querySelector('[role="alert"]').hidden, false);
});

test('requireText keeps confirm disabled until the exact word is typed', async () => {
  const { window, panel, calls, focused } = setup({ requireText: 'DELETE' });
  panel.open();
  const input = panel.element.querySelector('input');
  assert.equal(focused.at(-1), input);
  const confirm = buttons(panel)[1];
  assert.equal(confirm.disabled, true);
  typeInto(window, input, 'delete');
  assert.equal(confirm.disabled, true);
  click(window, confirm);
  await settle();
  assert.deepEqual(calls, []);
  typeInto(window, input, 'DELETE');
  assert.equal(confirm.disabled, false);
  click(window, confirm);
  await settle();
  assert.deepEqual(calls, ['confirm']);
});

test('reopening clears the typed text and old errors; message is text only', () => {
  const { window, panel } = setup({ requireText: 'DELETE', message: '<img src=x onerror=1>' });
  assert.equal(panel.element.querySelector('img'), null);
  panel.open();
  typeInto(window, panel.element.querySelector('input'), 'DELETE');
  panel.close();
  panel.open();
  assert.equal(panel.element.querySelector('input').value, '');
});
