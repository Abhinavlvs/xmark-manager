import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, fakeClient, settle, trackFocus } from '../../test-support/dom.js';
import { MSG } from '../../src/platform/messages.js';
import { createOptionsApp } from '../../src/options/app.js';

function fakeWin(hash = '') {
  const listeners = [];
  let current = hash;
  return {
    location: {
      get hash() {
        return current;
      },
      set hash(next) {
        current = next;
        listeners.forEach((fn) => fn());
      },
    },
    addEventListener: (type, fn) => type === 'hashchange' && listeners.push(fn),
  };
}

async function setup(hash, extra = {}) {
  const ctx = makeDom();
  const focused = trackFocus(ctx.window);
  const win = fakeWin(hash);
  const client = fakeClient({
    [MSG.LIST_FOLDERS]: [],
    [MSG.LIST_POSTS]: [],
    [MSG.GET_SETTINGS]: { saveSnippets: false },
    ...extra,
  });
  const app = createOptionsApp(ctx.dom, {
    client,
    win,
    permissions: { contains: async () => true, request: async () => true },
    version: '0.1.0',
    links: { source: '', privacyPolicy: '' },
    now: () => new Date(),
    createDownload: () => {},
  });
  ctx.document.body.append(app.element);
  app.start();
  await settle();
  const visible = () =>
    [...app.element.querySelectorAll('section.section')].filter((s) => !s.hidden).map((s) => s.id);
  return { ...ctx, focused, win, client, app, visible };
}

test('nav lists the sections as hash links and marks the current one', async () => {
  const { app } = await setup('#data');
  const links = [...app.element.querySelectorAll('nav a')];
  assert.deepEqual(
    links.map((a) => [a.textContent, a.getAttribute('href')]),
    [
      ['Saved', '#saved'],
      ['Folders', '#folders'],
      ['Data', '#data'],
      ['Privacy', '#privacy'],
      ['Permissions', '#permissions'],
      ['About', '#about'],
    ],
  );
  assert.deepEqual(
    links.map((a) => a.getAttribute('aria-current')),
    [null, null, 'page', null, null, null],
  );
});

test('only the routed section is visible; default is Saved', async () => {
  assert.deepEqual((await setup('')).visible(), ['section-saved']);
  assert.deepEqual((await setup('#folders')).visible(), ['section-folders']);
  assert.deepEqual((await setup('#privacy')).visible(), ['section-privacy']);
  assert.deepEqual((await setup('#bogus')).visible(), ['section-saved']);
});

test('hashchange (back/forward) switches section, loads it and moves focus to its heading', async () => {
  const { win, visible, client, focused, app } = await setup('#folders');
  const before = client.calls.filter((c) => c.type === MSG.GET_SETTINGS).length;
  win.location.hash = '#privacy';
  await settle();
  assert.deepEqual(visible(), ['section-privacy']);
  assert.equal(client.calls.filter((c) => c.type === MSG.GET_SETTINGS).length, before + 1);
  assert.equal(focused.at(-1), app.element.querySelector('#heading-privacy'));
  win.location.hash = '#folders';
  assert.deepEqual(visible(), ['section-folders']);
});

test('#folders-add shows Folders, the hint, and focuses the add-folder input', async () => {
  const { visible, focused, app } = await setup('#folders-add');
  assert.deepEqual(visible(), ['section-folders']);
  const input = app.element.querySelector('input[aria-label="New folder name"]');
  assert.equal(focused.at(-1), input);
  assert.match(app.element.textContent, /Create a folder, then go back to X and open Save again\./);
});

test('plain #folders keeps the hint hidden and focus alone', async () => {
  const { focused, app } = await setup('#folders');
  assert.equal(focused.length, 0);
  const hint = [...app.element.querySelectorAll('p')].find((p) =>
    /go back to X/.test(p.textContent),
  );
  assert.equal(hint.hidden, true);
});

test('the first render does not steal focus', async () => {
  assert.equal((await setup('#data')).focused.length, 0);
});

test('has a polite live region and a main landmark', async () => {
  const { app } = await setup('');
  const live = app.element.querySelector('[role="status"][aria-live="polite"].sr-only');
  assert.ok(live);
  assert.ok(app.element.querySelector('main'));
});

test('options shows the notice on every section and the Data card lists the copies', async () => {
  let copies = [
    { n: 1, id: 'abcd1234-0000', at: '2026-11-21T10:00:00.000Z', reason: 'not_object', bytes: 10 },
  ];
  const { app, win, client } = await setup('#folders', {
    [MSG.GET_STORAGE_STATUS]: () =>
      copies.length
        ? { state: 'quarantined', quarantinedAt: copies[0].at, reason: 'not_object', copies }
        : { state: 'ok' },
    [MSG.DISCARD_QUARANTINE]: () => {
      copies = [];
    },
  });
  const notice = app.element.querySelector('.notice-region');
  assert.ok(notice.querySelector('.quarantine-notice'));
  assert.match(notice.textContent, /1 copy of the unreadable data is kept/);
  assert.equal(notice.getAttribute('role'), 'status');
  win.location.hash = '#data';
  await settle();
  const card = app.element.querySelector('.unreadable-card');
  assert.equal(card.hidden, false);
  const find = (label) => [...card.querySelectorAll('button')].find((b) => b.textContent === label);
  find('Discard').click();
  find('Discard copy').click();
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.DISCARD_QUARANTINE).payload, {
    n: 1,
    id: 'abcd1234-0000',
  });
  assert.equal(card.hidden, true);
  assert.equal(notice.querySelector('.quarantine-notice'), null, 'the shell notice goes away');
});

test('the Saved section lists the saved posts when routed to #saved', async () => {
  const post = {
    id: 'p1',
    url: 'https://x.com/ada/status/123',
    author: 'ada',
    text_preview: 'hello saved',
    folder_id: null,
    tags: [],
    notes: '',
    created_at: '2025-01-01T00:00:00.000Z',
  };
  const { app, visible } = await setup('#saved', { [MSG.LIST_POSTS]: [post] });
  assert.deepEqual(visible(), ['section-saved']);
  assert.match(app.element.querySelector('#section-saved').textContent, /hello saved/);
});
