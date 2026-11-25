import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { resetContent, tick, fire, rootOf } from '../../test-support/content.js';
import { setup } from '../../test-support/panel-setup.js';

afterEach(() => {
  globalThis.__xmark?.stop?.();
  mock.timers.reset();
  resetContent();
  delete globalThis.innerWidth;
  delete globalThis.innerHeight;
});

const hostsIn = (document) => document.querySelectorAll('[data-xmark-panel-host]');

test('the panel host is a direct child of the document root, not inside the article', async () => {
  const { open, document } = await setup();
  assert.equal(hostsIn(document).length, 0);
  const a = await open();
  const [panelHost] = hostsIn(document);
  assert.equal(panelHost.parentNode, document.documentElement);
  assert.equal(panelHost.closest('article'), null);
  assert.equal(a.host.querySelector('[data-xmark-panel-host]'), null);
  assert.ok(a.panel());
  // The in-article host keeps only the small button.
  assert.equal(rootOf(a.host).querySelector('[role="dialog"]'), null);
});

test('the panel host is fixed with the maximal z-index and a closed root', async () => {
  const { open, document } = await setup();
  await open();
  const [panelHost] = hostsIn(document);
  assert.equal(panelHost.style.position, 'fixed');
  assert.equal(panelHost.style.zIndex, '2147483647');
  assert.equal(panelHost.shadowRoot, null);
  assert.ok(rootOf(panelHost));
});

test('at most one panel host exists at a time', async () => {
  const { open, document } = await setup();
  await open(0);
  await open(1);
  assert.equal(hostsIn(document).length, 1);
});

test('the panel host is removed on toggle, Escape, outside click and after save', async () => {
  const { open, window, document } = await setup();
  let a = await open();
  fire(window, a.button, 'click');
  assert.equal(hostsIn(document).length, 0);
  a = await open();
  fire(window, a.panel().querySelector('input'), 'keydown', { key: 'Escape' });
  assert.equal(hostsIn(document).length, 0);
  await open();
  fire(window, document.body, 'pointerdown');
  assert.equal(hostsIn(document).length, 0);
  a = await open();
  mock.timers.enable({ apis: ['setTimeout'] });
  fire(window, a.panel().querySelector('button.xm-primary'), 'click');
  await Promise.resolve();
  await new Promise((r) => process.nextTick(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(hostsIn(document).length, 1);
  mock.timers.tick(1200);
  assert.equal(hostsIn(document).length, 0);
});

test('the panel host is removed when the anchor host disappears', async () => {
  const { open, document, sched } = await setup();
  const a = await open();
  a.host.remove();
  document.body.appendChild(document.createElement('div'));
  await tick();
  sched.flush();
  assert.equal(hostsIn(document).length, 0);
});

test('Escape whose target is either of our hosts closes; one elsewhere does not', async () => {
  const { open, window, document } = await setup();
  let a = await open();
  fire(window, a.panelHost(), 'keydown', { key: 'Escape' });
  assert.equal(hostsIn(document).length, 0);
  a = await open();
  fire(window, a.host, 'keydown', { key: 'Escape' });
  assert.equal(hostsIn(document).length, 0);
  a = await open();
  fire(window, document.body, 'keydown', { key: 'Escape' });
  assert.equal(hostsIn(document).length, 1);
  fire(window, a.panelHost(), 'pointerdown');
  fire(window, a.host, 'pointerdown');
  assert.equal(hostsIn(document).length, 1);
});

test('events from the panel stop at the panel root', async () => {
  const { open, window, document } = await setup();
  const a = await open();
  const leaked = [];
  for (const type of ['keydown', 'click', 'input', 'paste']) {
    document.addEventListener(type, () => leaked.push(type));
  }
  const area = a.panel().querySelector('textarea');
  for (const type of ['keydown', 'click', 'input', 'paste']) fire(window, area, type, { key: 'l' });
  assert.deepEqual(leaked, []);
});

test('focus moves into the panel host on open and back to the button on close', async () => {
  const { open, window, document } = await setup();
  const focused = [];
  window.HTMLElement.prototype.focus = function () {
    focused.push(this);
  };
  const a = await open();
  const select = focused.at(-1);
  assert.equal(select.tagName, 'SELECT');
  assert.ok(rootOf(hostsIn(document)[0]).contains(select));
  fire(window, select, 'keydown', { key: 'Escape' });
  assert.equal(focused.at(-1), a.button);
});

test('untrusted button and Save clicks neither open nor save', async () => {
  const { api, window, document, calls } = await setup();
  const a = api();
  fire(window, a.button, 'click', { isTrusted: false });
  await tick();
  assert.equal(hostsIn(document).length, 0);
  assert.equal(calls.length, 0);
});

test('untrusted Close click in the unreadable panel keeps it open', async () => {
  const { ARTICLE } = await import('../../test-support/content.js');
  const body = ARTICLE('1').replace(/<a href[^]*?<\/a>/, '');
  const { open, window, document } = await setup({ body });
  const a = await open();
  fire(window, a.panel().querySelector('button.xm-close'), 'click', { isTrusted: false });
  assert.equal(hostsIn(document).length, 1);
});

function geometry(window, { button, panel }) {
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  const rects = { button, panel };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const r = this.classList?.contains('xm-panel') ? rects.panel : rects.button;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height };
  };
  return rects;
}

test('the host is placed in viewport coordinates and repositions on scroll and resize', async () => {
  const { open, window, document } = await setup();
  const rects = geometry(window, {
    button: { top: 100, left: 600, width: 34, height: 34 },
    panel: { top: 0, left: 0, width: 320, height: 250 },
  });
  const a = await open();
  const host = a.panelHost();
  assert.equal(host.style.left, '314px');
  assert.equal(host.style.top, '138px');
  rects.button = { top: 300, left: 600, width: 34, height: 34 };
  fire(window, window, 'scroll');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(hostsIn(document)[0].style.top, '338px');
  rects.button = { top: 300, left: 400, width: 34, height: 34 };
  fire(window, window, 'resize');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(hostsIn(document)[0].style.left, '114px');
});

test('scroll and resize listeners exist only while the panel is open', async () => {
  const { open, window } = await setup();
  const added = [];
  const removed = [];
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = (t, f, o) => (added.push(t), add(t, f, o));
  window.removeEventListener = (t, f, o) => (removed.push(t), remove(t, f, o));
  const a = await open();
  const count = (list, t) => list.filter((x) => x === t).length;
  assert.equal(count(added, 'scroll'), 1);
  assert.equal(count(added, 'resize'), 1);
  assert.equal(count(removed, 'scroll'), 0);
  fire(window, a.button, 'click');
  assert.equal(count(removed, 'scroll'), 1);
  assert.equal(count(removed, 'resize'), 1);
  await open();
  assert.equal(count(added, 'scroll'), 2);
});

test('scrolling the anchor out of the viewport closes the panel', async () => {
  const { open, window, document } = await setup();
  const rects = geometry(window, {
    button: { top: 100, left: 600, width: 34, height: 34 },
    panel: { top: 0, left: 0, width: 320, height: 250 },
  });
  await open();
  rects.button = { top: -200, left: 600, width: 34, height: 34 };
  fire(window, window, 'scroll');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(hostsIn(document).length, 0);
});

test('a scroll after the anchor left the DOM closes the panel', async () => {
  const { open, window, document } = await setup();
  const a = await open();
  a.host.remove();
  fire(window, window, 'scroll');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(hostsIn(document).length, 0);
});
