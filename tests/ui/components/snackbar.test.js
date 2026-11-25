import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, click, fire, textOf } from '../../../test-support/dom.js';
import { createSnackbar } from '../../../src/ui/components/snackbar.js';

function setup() {
  const ctx = makeDom();
  const timers = [];
  const snack = createSnackbar(ctx.dom, {
    setTimer: (fn, ms) => timers.push({ fn, ms, cleared: false }) - 1,
    clearTimer: (id) => (timers[id].cleared = true),
  });
  ctx.document.body.append(snack.element);
  return { ...ctx, snack, timers };
}

test('is a polite live region and hidden until shown', () => {
  const { snack } = setup();
  assert.equal(snack.element.getAttribute('role'), 'status');
  assert.equal(snack.element.hidden, true);
});

test('show renders text and an Undo button, auto-hides after 6s', () => {
  const { snack, timers } = setup();
  snack.show('Post deleted', { onAction: () => {} });
  assert.equal(snack.element.hidden, false);
  assert.match(textOf(snack.element), /Post deleted/);
  assert.equal(snack.element.querySelector('button').textContent, 'Undo');
  assert.equal(timers[0].ms, 6000);
  timers[0].fn();
  assert.equal(snack.element.hidden, true);
});

test('Undo runs the action once, hides and clears the timer', () => {
  const { window, snack, timers } = setup();
  let undone = 0;
  snack.show('Post deleted', { onAction: () => (undone += 1) });
  click(window, snack.element.querySelector('button'));
  assert.equal(undone, 1);
  assert.equal(snack.element.hidden, true);
  assert.equal(timers[0].cleared, true);
});

test('a second message stacks: newest shows with a count, Undo keeps the earlier one', () => {
  const { window, snack, timers } = setup();
  const undone = [];
  snack.show('one', { onAction: () => undone.push('one') });
  snack.show('two', { onAction: () => undone.push('two') });
  assert.equal(timers[0].cleared, true);
  assert.equal(snack.element.querySelectorAll('button').length, 1);
  assert.match(textOf(snack.element), /two \(2 to undo\)/);
  click(window, snack.element.querySelector('button'));
  assert.deepEqual(undone, ['two']);
  assert.equal(snack.element.hidden, false);
  assert.match(textOf(snack.element), /one/);
  assert.equal(timers.at(-1).cleared, false);
  click(window, snack.element.querySelector('button'));
  assert.deepEqual(undone, ['two', 'one']);
  assert.equal(snack.element.hidden, true);
});

test('timer pauses on hover and focus-within, resumes on leave and blur', () => {
  const { window, snack, timers } = setup();
  snack.show('x', { onAction: () => {} });
  fire(window, snack.element, 'mouseenter');
  assert.equal(timers[0].cleared, true);
  fire(window, snack.element, 'mouseleave');
  assert.equal(timers.length, 2);
  assert.equal(timers[1].cleared, false);
  fire(window, snack.element, 'focusin');
  assert.equal(timers[1].cleared, true);
  fire(window, snack.element, 'focusout');
  assert.equal(timers.length, 3);
  assert.equal(timers[2].ms, 6000);
});

test('stays paused while hovered even if focus leaves', () => {
  const { window, snack, timers } = setup();
  snack.show('x', { onAction: () => {} });
  fire(window, snack.element, 'mouseenter');
  fire(window, snack.element, 'focusin');
  fire(window, snack.element, 'focusout');
  assert.equal(timers.length, 1);
});
