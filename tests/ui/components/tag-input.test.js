import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, press, typeInto, click, fire } from '../../../test-support/dom.js';
import { createTagInput } from '../../../src/ui/components/tag-input.js';

function setup(opts = {}) {
  const ctx = makeDom();
  const changes = [];
  const ti = createTagInput(ctx.dom, { onChange: (t) => changes.push(t), ...opts });
  ctx.document.body.append(ti.element);
  return { ...ctx, ti, changes };
}
const chipTexts = (ti) =>
  [...ti.element.querySelectorAll('.chip')].map((c) => c.firstElementChild.textContent);

test('Enter commits the typed tag as a chip and clears the input', () => {
  const { window, ti, changes } = setup();
  typeInto(window, ti.input, '#AI');
  const e = press(window, ti.input, 'Enter');
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(ti.getTags(), ['ai']);
  assert.equal(ti.input.value, '');
  assert.deepEqual(chipTexts(ti), ['#ai']);
  assert.deepEqual(changes.at(-1), ['ai']);
});

test('comma and space also commit', () => {
  const { window, ti } = setup();
  typeInto(window, ti.input, 'one');
  press(window, ti.input, ',');
  typeInto(window, ti.input, 'two');
  press(window, ti.input, ' ');
  assert.deepEqual(ti.getTags(), ['one', 'two']);
});

test('Enter on an empty input does nothing and is not swallowed', () => {
  const { window, ti } = setup();
  const e = press(window, ti.input, 'Enter');
  assert.equal(e.defaultPrevented, false);
  assert.deepEqual(ti.getTags(), []);
});

test('Backspace on empty input removes the last tag; not when text is present', () => {
  const { window, ti } = setup({ tags: ['a', 'b'] });
  press(window, ti.input, 'Backspace');
  assert.deepEqual(ti.getTags(), ['a']);
  typeInto(window, ti.input, 'x');
  press(window, ti.input, 'Backspace');
  assert.deepEqual(ti.getTags(), ['a']);
});

test('pasting text with separators splits into tags', () => {
  const { window, ti } = setup();
  typeInto(window, ti.input, '#rust, go\nzig');
  assert.deepEqual(ti.getTags(), ['rust', 'go', 'zig']);
  assert.equal(ti.input.value, '');
});

test('duplicates are ignored', () => {
  const { window, ti } = setup({ tags: ['a'] });
  typeInto(window, ti.input, 'A');
  press(window, ti.input, 'Enter');
  assert.deepEqual(ti.getTags(), ['a']);
});

test('caps at 20 tags and disables the input', () => {
  const { window, ti } = setup();
  typeInto(window, ti.input, Array.from({ length: 25 }, (_, i) => `t${i}`).join(' '));
  assert.equal(ti.getTags().length, 20);
  assert.equal(ti.input.hasAttribute('disabled'), true);
  click(window, ti.element.querySelector('.chip button'));
  assert.equal(ti.getTags().length, 19);
  assert.equal(ti.input.hasAttribute('disabled'), false);
});

test('each chip has an accessible remove button', () => {
  const { window, ti } = setup({ tags: ['ai', 'ml'] });
  const buttons = [...ti.element.querySelectorAll('.chip button')];
  assert.deepEqual(
    buttons.map((b) => b.getAttribute('aria-label')),
    ['Remove tag ai', 'Remove tag ml'],
  );
  assert.equal(buttons[0].getAttribute('type'), 'button');
  click(window, buttons[0]);
  assert.deepEqual(ti.getTags(), ['ml']);
});

test('blur commits leftover text', () => {
  const { window, ti } = setup();
  typeInto(window, ti.input, 'late');
  fire(window, ti.input, 'blur');
  assert.deepEqual(ti.getTags(), ['late']);
});

test('tag text is rendered as text, never HTML', () => {
  const { ti } = setup({ tags: ['<img src=x onerror=alert(1)>'] });
  assert.equal(ti.element.querySelector('img'), null);
});
