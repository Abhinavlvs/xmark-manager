/**
 * DOM test helpers built on linkedom. Not under tests/.
 */

import { parseHTML } from 'linkedom';
import { createDom } from '../src/ui/dom.js';

export function makeDom() {
  const window = parseHTML('<!doctype html><html><body></body></html>');
  const { document } = window;
  return { window, document, dom: createDom(document) };
}

/** Dispatch a bubbling event, optionally with extra own properties (key, etc). */
export function fire(window, node, type, props = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  node.dispatchEvent(event);
  return event;
}

export const click = (window, node) => fire(window, node, 'click');
export const press = (window, node, key) => fire(window, node, 'keydown', { key });

/** Set an input's value and fire `input`. */
export function typeInto(window, input, value) {
  input.value = value;
  fire(window, input, 'input');
}

/** Let queued promise callbacks and zero-delay timers run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * Fake runtime client. `routes` maps message type to a value or function(payload).
 * Records every call in `calls`.
 */
export function fakeClient(routes = {}) {
  const calls = [];
  return {
    calls,
    async request(type, payload) {
      calls.push({ type, payload });
      const route = routes[type];
      if (route === undefined) return undefined;
      return typeof route === 'function' ? route(payload, calls) : route;
    },
  };
}

export const textOf = (node) => node.textContent.replace(/\s+/g, ' ').trim();

/** Choose an option by value and fire `change` (linkedom's select.value has no setter). */
export function choose(window, select, value) {
  for (const option of select.options) if (option.value === value) option.selected = true;
  fire(window, select, 'change');
}

/** linkedom does not track focus; record elements whose focus() was called. */
export function trackFocus(window) {
  const focused = [];
  window.HTMLElement.prototype.focus = function focus() {
    focused.push(this);
  };
  return focused;
}
