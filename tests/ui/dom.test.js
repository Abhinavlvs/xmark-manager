import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, click } from '../../test-support/dom.js';

test('el builds elements with class, text, attrs, dataset and handlers', () => {
  const { dom, window } = makeDom();
  let hits = 0;
  const node = dom.el('button', {
    class: 'btn primary',
    text: 'Go',
    attrs: { 'aria-label': 'Go now', disabled: false, hidden: true },
    dataset: { id: '7' },
    on: { click: () => (hits += 1) },
  });
  assert.equal(node.tagName, 'BUTTON');
  assert.equal(node.className, 'btn primary');
  assert.equal(node.textContent, 'Go');
  assert.equal(node.getAttribute('aria-label'), 'Go now');
  assert.equal(node.hasAttribute('disabled'), false);
  assert.equal(node.hasAttribute('hidden'), true);
  assert.equal(node.dataset.id, '7');
  click(window, node);
  assert.equal(hits, 1);
});

test('el turns string children into text nodes and never parses HTML', () => {
  const { dom, document } = makeDom();
  const payload = '<img src=x onerror=alert(1)>';
  const node = dom.el('p', {}, payload, dom.el('b', { text: 'x' }), null, 3);
  assert.equal(node.querySelector('img'), null);
  assert.equal(node.firstChild.nodeType, document.TEXT_NODE ?? 3);
  assert.equal(node.firstChild.nodeValue, payload);
  assert.equal(node.querySelector('b').textContent, 'x');
  assert.equal(node.lastChild.nodeValue, '3');
});

test('clear removes all children', () => {
  const { dom } = makeDom();
  const node = dom.el('div', {}, 'a', dom.el('i'), 'b');
  dom.clear(node);
  assert.equal(node.childNodes.length, 0);
});
