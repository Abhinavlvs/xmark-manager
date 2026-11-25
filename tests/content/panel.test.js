import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { resetContent, ARTICLE, tick, fire } from '../../test-support/content.js';

afterEach(() => {
  globalThis.__xmark?.stop?.();
  mock.timers.reset();
  resetContent();
});

import { setup, SAVED } from '../../test-support/panel-setup.js';

test('click renders folders (Uncategorised first) and focuses the select', async () => {
  const { open, window } = await setup();
  const focused = [];
  window.HTMLElement.prototype.focus = function () {
    focused.push(this);
  };
  const a = await open();
  const dialog = a.panel();
  assert.equal(dialog.getAttribute('aria-label'), 'Save to xmark-manager');
  const options = Array.from(dialog.querySelectorAll('select option')).map((o) => o.textContent);
  assert.deepEqual(options, ['Uncategorised', 'Reading', 'Code', 'Add folder…']);
  assert.equal(focused.at(-1).tagName, 'SELECT');
});

test('reads the post only on click, not on inject', async () => {
  const reads = [];
  const ctx = await setup({
    beforeStart: ({ xmark }) => {
      const real = xmark.selectors;
      const spy =
        (name) =>
        (...a) => (reads.push(name), real[name](...a));
      xmark.selectors = Object.freeze({
        ...real,
        findStatusLink: spy('findStatusLink'),
        findTextNode: spy('findTextNode'),
      });
      const realExtract = xmark.extractPost;
      xmark.extractPost = (...a) => (reads.push('extractPost'), realExtract(...a));
    },
  });
  // Spies were installed before the first start() and flush.
  assert.deepEqual(reads, []);
  assert.equal(ctx.calls.length, 0);
  await ctx.open();
  assert.ok(reads.includes('extractPost'));
  assert.deepEqual(ctx.calls.map((c) => c.type).sort(), ['GET_SETTINGS', 'LIST_FOLDERS']);
});

test('saves with the right payload; omits textPreview when empty', async () => {
  const { open, calls, window } = await setup();
  const a = await open();
  const dialog = a.panel();
  const select = dialog.querySelector('select');
  for (const o of select.options) if (o.value === 'f2') o.selected = true;
  dialog.querySelector('input').value = 'ai, llm  web,ai';
  dialog.querySelector('textarea').value = 'my notes';
  fire(window, dialog.querySelector('button.xm-primary'), 'click');
  await tick();
  const save = calls.find((c) => c.type === 'SAVE_POST');
  assert.deepEqual(save.payload, {
    url: 'https://x.com/alice/status/1',
    folderId: 'f2',
    tags: ['ai', 'llm', 'web'],
    notes: 'my notes',
  });
  assert.match(a.panel().textContent, /Saved/);
});

test('uncategorised sends folderId null; limits tags to 20', async () => {
  const { open, calls, window } = await setup();
  const a = await open();
  a.panel().querySelector('input').value = Array.from({ length: 30 }, (_, i) => `t${i}`).join(' ');
  fire(window, a.panel().querySelector('button.xm-primary'), 'click');
  await tick();
  const { payload } = calls.find((c) => c.type === 'SAVE_POST');
  assert.equal(payload.folderId, null);
  assert.equal(payload.tags.length, 20);
});

test('includes textPreview only when saveSnippets is on', async () => {
  const { open, calls, window } = await setup({
    routes: { GET_SETTINGS: { ok: true, data: { saveSnippets: true } } },
  });
  const a = await open();
  fire(window, a.panel().querySelector('button.xm-primary'), 'click');
  await tick();
  assert.equal(calls.find((c) => c.type === 'SAVE_POST').payload.textPreview, 'hello world');
});

test('double submit is blocked while a save is in flight', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { open, calls, window } = await setup({ routes: { SAVE_POST: () => gate } });
  const a = await open();
  const save = a.panel().querySelector('button.xm-primary');
  fire(window, save, 'click');
  fire(window, save, 'click');
  await tick();
  assert.equal(calls.filter((c) => c.type === 'SAVE_POST').length, 1);
  assert.match(save.textContent, /Saving/);
  release(SAVED);
  await tick();
});

test('errors map to friendly text with role=alert and offer Retry', async () => {
  const codes = [
    'InvalidPostUrlError',
    'NotFoundError',
    'rejected',
    'internal_error',
    'bad_payload',
  ];
  const seen = new Set();
  for (const error of codes) {
    const { open, window } = await setup({ routes: { SAVE_POST: { ok: false, error } } });
    const a = await open();
    const save = a.panel().querySelector('button.xm-primary');
    fire(window, save, 'click');
    await tick();
    const alert = a.panel().querySelector('[role="alert"]');
    assert.ok(alert.textContent.length > 5, error);
    assert.ok(!alert.textContent.includes(error) || error === 'rejected');
    seen.add(alert.textContent);
    assert.match(save.textContent, /Retry/);
    assert.equal(save.disabled, false);
    resetContent();
  }
  assert.ok(seen.size >= 4);
});

test('Escape inside the panel closes it and returns focus; outside click closes without focus', async () => {
  const { open, window, document } = await setup();
  const focused = [];
  window.HTMLElement.prototype.focus = function (opts) {
    focused.push([this, opts]);
  };
  let a = await open();
  focused.length = 0;
  fire(window, a.panel().querySelector('input'), 'keydown', { key: 'Escape' });
  assert.equal(a.panel(), null);
  assert.equal(focused.at(-1)[0], a.button);
  assert.deepEqual(focused.at(-1)[1], { preventScroll: true });
  a = await open();
  focused.length = 0;
  fire(window, document.body, 'pointerdown');
  assert.equal(a.panel(), null);
  assert.equal(focused.length, 0);
});

test('an unrelated page Escape does not close the panel', async () => {
  const { open, window, document } = await setup();
  const a = await open();
  fire(window, document.body, 'keydown', { key: 'Escape' });
  assert.ok(a.panel());
});

test('capture-phase Escape on the inner input closes before the root stops it', async () => {
  const { open, window } = await setup();
  const a = await open();
  const input = a.panel().querySelector('input');
  fire(window, input, 'keydown', { key: 'Escape' });
  assert.equal(a.panel(), null);
});

test('untrusted Save click sends nothing', async () => {
  const { open, window, calls } = await setup();
  const a = await open();
  fire(window, a.panel().querySelector('button.xm-primary'), 'click', { isTrusted: false });
  await tick();
  assert.equal(calls.filter((c) => c.type === 'SAVE_POST').length, 0);
});

test('a recycled article drops the preview', async () => {
  const ctx = await setup({
    routes: { GET_SETTINGS: { ok: true, data: { saveSnippets: true } } },
  });
  const real = ctx.xmark.extractPost;
  let n = 0;
  ctx.xmark.extractPost = (art, opts) => {
    n += 1;
    const out = real(art, opts);
    return n === 2 && out
      ? { ...out, url: 'https://x.com/other/status/9', textPreview: 'other' }
      : out;
  };
  const a = await ctx.open();
  fire(ctx.window, a.panel().querySelector('button.xm-primary'), 'click');
  await tick();
  const { payload } = ctx.calls.find((c) => c.type === 'SAVE_POST');
  assert.equal(payload.url, 'https://x.com/alice/status/1');
  assert.equal('textPreview' in payload, false);
});

test('button exposes haspopup, expanded and, once saved, pressed with a Saved label', async () => {
  const { open, window } = await setup();
  const a = await open();
  assert.equal(a.button.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(a.button.getAttribute('aria-expanded'), 'true');
  fire(window, a.panel().querySelector('button.xm-primary'), 'click');
  await tick();
  assert.equal(a.button.getAttribute('aria-pressed'), 'true');
  assert.equal(a.button.getAttribute('aria-label'), 'Saved to xmark-manager');
  fire(window, a.button, 'click');
  await tick();
  assert.equal(a.button.getAttribute('aria-expanded'), 'false');
});

test('unreadable post panel has a Close button that closes it', async () => {
  const body = ARTICLE('1').replace(/<a href[^]*?<\/a>/, '');
  const { open, window } = await setup({ body });
  const a = await open();
  const close = a.panel().querySelector('button.xm-close');
  assert.ok(close);
  fire(window, close, 'click');
  assert.equal(a.panel(), null);
});

test('panel is placed using the button and viewport geometry', async () => {
  const { open, window } = await setup();
  window.innerWidth = 1000;
  window.innerHeight = 300;
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 300;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList?.contains('xm-panel')
      ? { top: 0, bottom: 250, left: 0, right: 320, width: 320, height: 250 }
      : { top: 200, bottom: 234, left: 10, right: 44, width: 34, height: 34 };
  };
  const a = await open();
  assert.equal(a.panel().getAttribute('data-placement'), 'above');
  assert.equal(a.panel().getAttribute('data-align'), 'left');
  delete globalThis.innerWidth;
  delete globalThis.innerHeight;
});
test('clicking inside the panel does not close it', async () => {
  const { open, window } = await setup();
  const a = await open();
  fire(window, a.panel().querySelector('textarea'), 'pointerdown');
  assert.ok(a.panel());
});

test('only one panel at a time', async () => {
  const { open } = await setup();
  const first = await open(0);
  const second = await open(1);
  assert.equal(first.button.getAttribute('aria-expanded'), 'false');
  assert.equal(second.button.getAttribute('aria-expanded'), 'true');
  assert.ok(second.panel());
});

test('clicking the button again toggles the panel closed', async () => {
  const { open, window } = await setup();
  const a = await open();
  fire(window, a.button, 'click');
  await tick();
  assert.equal(a.panel(), null);
});

test('auto-closes 1.2 s after a successful save and keeps the saved glyph', async () => {
  const { open, window } = await setup();
  const a = await open();
  mock.timers.enable({ apis: ['setTimeout'] });
  fire(window, a.panel().querySelector('button.xm-primary'), 'click');
  await Promise.resolve();
  await new Promise((r) => process.nextTick(r));
  await new Promise((r) => setImmediate(r));
  mock.timers.tick(1200);
  assert.equal(a.panel(), null);
  assert.equal(a.button.getAttribute('data-saved'), 'true');
});

test('closes when the host element is removed from the page', async () => {
  const { open, document, sched } = await setup();
  const a = await open();
  a.host.remove();
  document.body.appendChild(document.createElement('div'));
  await tick();
  sched.flush();
  assert.equal(a.panel(), null);
});

test('stops keyboard and click events from reaching X handlers', async () => {
  const { open, window, document } = await setup();
  const a = await open();
  const leaked = [];
  for (const type of ['keydown', 'keyup', 'keypress', 'click']) {
    document.addEventListener(type, () => leaked.push(type));
  }
  const input = a.panel().querySelector('input');
  for (const type of ['keydown', 'keyup', 'keypress', 'click']) {
    fire(window, input, type, { key: 'l' });
  }
  assert.deepEqual(leaked, []);
});

test('text-carrying events from inside the panel never reach page bubble listeners', async () => {
  const { open, window, document } = await setup();
  const a = await open();
  const types = [
    'beforeinput',
    'input',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'paste',
    'copy',
    'cut',
  ];
  const leaked = [];
  const stopped = [];
  for (const type of types) document.addEventListener(type, () => leaked.push(type));
  // linkedom does not cross the closed root, so also assert our root really calls stopPropagation.
  for (const type of types) {
    fire(window, a.panel().querySelector('textarea'), type, {
      data: 'x',
      stopPropagation: () => stopped.push(type),
    });
  }
  assert.deepEqual(leaked, []);
  assert.deepEqual(stopped, types);
});

test('PRIVACY.md does not claim fields are out of the page reach', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../../PRIVACY.md', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /out of the page'?s reach/i);
  assert.match(text, /keystrokes/i);
});

test('dynamic strings are rendered as text only', async () => {
  const evil = '<img src=x onerror=1>';
  const { open } = await setup({
    routes: { LIST_FOLDERS: { ok: true, data: [{ id: 'f1', name: evil }] } },
  });
  const a = await open();
  assert.equal(a.panel().querySelector('img'), null);
  assert.equal(a.panel().querySelectorAll('option')[1].textContent, evil);
});

test('missing post link shows an error and no save form', async () => {
  const body = ARTICLE('1').replace(/<a href[^]*?<\/a>/, '');
  const { open } = await setup({ body });
  const a = await open();
  assert.ok(a.panel().querySelector('[role="alert"]'));
  assert.equal(a.panel().querySelector('button.xm-primary'), null);
});

test('folder or settings failures still allow saving to Uncategorised', async () => {
  const { open } = await setup({
    routes: { LIST_FOLDERS: { ok: false, error: 'internal_error' }, GET_SETTINGS: undefined },
  });
  const a = await open();
  assert.equal(a.panel().querySelectorAll('option').length, 2);
});

test('failed saves show the storage texts; prototype-ish codes get the generic text', async () => {
  const wanted = new Map([
    ['storage_full', /library may be full.*Options > Data/],
    ['storage_error', /Couldn't save\. Try again\./],
  ]);
  for (const error of ['storage_full', 'storage_error', 'constructor', 'toString']) {
    const { open, window } = await setup({ routes: { SAVE_POST: { ok: false, error } } });
    const a = await open();
    fire(window, a.panel().querySelector('button.xm-primary'), 'click');
    await tick();
    const text = a.panel().querySelector('[role="alert"]').textContent;
    assert.match(text, wanted.get(error) ?? /Something went wrong/, error);
    resetContent();
  }
});

test('the chosen snippet length is threaded to the extractor', async () => {
  const ctx = await setup({
    routes: { GET_SETTINGS: { ok: true, data: { saveSnippets: true, snippetLength: 60 } } },
  });
  const seen = [];
  const real = ctx.xmark.extractPost;
  ctx.xmark.extractPost = (art, opts) => (seen.push(opts), real(art, opts));
  await ctx.open();
  assert.deepEqual(
    seen.map((o) => [o.includeText, o.maxLength]),
    [
      [false, undefined],
      [true, 60],
    ],
  );
});

test('a missing, junk or out-of-range snippetLength is clamped in the panel', async () => {
  for (const [given, want] of [
    [undefined, 280],
    ['60', 280],
    [NaN, 280],
    [10, 35],
    [5000, 280],
    [60.4, 60],
  ]) {
    const ctx = await setup({
      routes: { GET_SETTINGS: { ok: true, data: { saveSnippets: true, snippetLength: given } } },
    });
    const seen = [];
    const real = ctx.xmark.extractPost;
    ctx.xmark.extractPost = (art, opts) => (seen.push(opts), real(art, opts));
    await ctx.open();
    assert.equal(seen.at(-1).maxLength, want, String(given));
  }
});
