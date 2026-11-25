import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, click, textOf } from '../../../test-support/dom.js';
import { createEmptyState } from '../../../src/ui/components/empty-state.js';

test('renders title, body and an optional action', () => {
  const { dom, window } = makeDom();
  let hit = 0;
  const node = createEmptyState(dom, {
    title: 'Nothing',
    body: '<b>x</b>',
    action: { label: 'Retry', onClick: () => (hit += 1) },
  });
  assert.match(textOf(node), /Nothing/);
  assert.equal(node.querySelector('b'), null);
  click(window, node.querySelector('button'));
  assert.equal(hit, 1);
});

test('error variant is announced with role=alert', () => {
  const { dom } = makeDom();
  const node = createEmptyState(dom, { title: 't', body: 'b', role: 'alert' });
  assert.equal(node.getAttribute('role'), 'alert');
  assert.equal(node.querySelector('button'), null);
});
