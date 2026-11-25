import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadContent,
  resetContent,
  ARTICLE,
  ALL_FILES,
  manualScheduler,
  installRuntime,
  tick,
  fire,
} from '../../test-support/content.js';

afterEach(async () => {
  globalThis.__xmark?.stop?.();
  resetContent();
});

const FILES = ALL_FILES.filter((f) => f !== 'main.js');
const hosts = (document) => document.querySelectorAll('[data-xmark-host]');

async function setup(body) {
  const ctx = await loadContent(FILES, body);
  const sched = manualScheduler();
  ctx.xmark.start({ schedule: sched.schedule });
  sched.flush();
  return { ...ctx, sched };
}

test('injects exactly one host per action bar', async () => {
  const { document } = await setup(ARTICLE('1') + ARTICLE('2'));
  assert.equal(hosts(document).length, 2);
  for (const bar of document.querySelectorAll('[role="group"]')) {
    assert.equal(bar.querySelectorAll('[data-xmark-host]').length, 1);
  }
});

test('host holds an open shadow root with a style and the labelled button', async () => {
  const { document } = await setup(ARTICLE('1'));
  const host = hosts(document)[0];
  assert.equal(host.shadowRoot, null, 'root is closed');
  const root = globalThis.__xmark.injector.rootFor(host);
  assert.ok(root.querySelector('style').textContent.length > 0);
  const button = root.querySelector('button');
  assert.equal(button.getAttribute('aria-label'), 'Save to xmark-manager');
  assert.equal(button.getAttribute('title'), 'Save to xmark-manager');
});

test('is idempotent across repeated mutations', async () => {
  const { document, sched } = await setup(ARTICLE('1'));
  for (let i = 0; i < 3; i += 1) {
    document.body.appendChild(document.createElement('div'));
    await tick();
    sched.flush();
  }
  assert.equal(hosts(document).length, 1);
});

test('picks up articles added later and action bars rendered late', async () => {
  const { document, window, sched } = await setup('');
  const wrap = document.createElement('div');
  wrap.innerHTML = ARTICLE('7', { bar: false });
  document.body.appendChild(wrap);
  await tick();
  sched.flush();
  assert.equal(hosts(document).length, 0);
  const article = wrap.querySelector('article');
  const bar = document.createElement('div');
  bar.setAttribute('role', 'group');
  bar.innerHTML = '<button data-testid="like"></button>';
  article.appendChild(bar);
  await tick();
  sched.flush();
  assert.equal(hosts(document).length, 1);
  assert.ok(window);
});

test('ignores articles without an action bar and never throws', async () => {
  const { document } = await setup(
    ARTICLE('1', { bar: false }) + '<article data-testid="tweet"></article>',
  );
  assert.equal(hosts(document).length, 0);
});

test('never touches X elements: only appends our host', async () => {
  const body = ARTICLE('1');
  const before = await loadContent(FILES, body);
  const barBefore = before.document.querySelector('[role="group"]');
  const kids = Array.from(barBefore.children);
  const attrs = Array.from(barBefore.attributes).map((a) => `${a.name}=${a.value}`);
  const articleKids = Array.from(before.document.querySelector('article').children);
  const sched = manualScheduler();
  before.xmark.start({ schedule: sched.schedule });
  sched.flush();
  const bar = before.document.querySelector('[role="group"]');
  assert.deepEqual(Array.from(bar.children).slice(0, kids.length), kids);
  assert.equal(bar.children.length, kids.length + 1);
  assert.equal(bar.lastElementChild.hasAttribute('data-xmark-host'), true);
  assert.deepEqual(
    Array.from(bar.attributes).map((a) => `${a.name}=${a.value}`),
    attrs,
  );
  assert.deepEqual(Array.from(before.document.querySelector('article').children), articleKids);
});

test('stop disconnects: later articles are not processed', async () => {
  const { document, xmark, sched } = await setup('');
  xmark.stop();
  const wrap = document.createElement('div');
  wrap.innerHTML = ARTICLE('9');
  document.body.appendChild(wrap);
  await tick();
  sched.flush();
  assert.equal(hosts(document).length, 0);
});

test('our own append does not trigger another injection pass', async () => {
  const ctx = await loadContent(FILES, ARTICLE('1') + ARTICLE('2'));
  const real = ctx.xmark.selectors;
  let calls = 0;
  ctx.xmark.selectors = Object.freeze({
    ...real,
    findActionBar: (a) => {
      calls += 1;
      return real.findActionBar(a);
    },
  });
  const sched = manualScheduler();
  ctx.xmark.start({ schedule: sched.schedule });
  sched.flush();
  assert.equal(calls, 2);
  await tick();
  sched.flush();
  await tick();
  sched.flush();
  assert.equal(calls, 2);
  ctx.document.body.appendChild(ctx.document.createElement('div'));
  await tick();
  sched.flush();
  assert.equal(calls, 2);
});

test('an untrusted (script-made) click on the button does nothing', async () => {
  const ctx = await setup(ARTICLE('1'));
  const calls = installRuntime({
    LIST_FOLDERS: { ok: true, data: [] },
    GET_SETTINGS: { ok: true, data: {} },
  });
  const spied = [];
  const real = ctx.xmark.extractPost;
  ctx.xmark.extractPost = (...a) => (spied.push(a), real(...a));
  const root = ctx.xmark.injector.rootFor(hosts(ctx.document)[0]);
  fire(ctx.window, root.querySelector('button'), 'click', { isTrusted: false });
  await tick();
  assert.equal(calls.length, 0);
  assert.equal(spied.length, 0);
  assert.equal(root.querySelector('[role="dialog"]'), null);
});
