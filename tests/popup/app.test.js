import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, fakeClient, click, press, settle } from '../../test-support/dom.js';
import { MSG } from '../../src/platform/messages.js';
import { createApp } from '../../src/popup/app.js';

async function setup(tabUrl, extra = {}) {
  const ctx = makeDom();
  const downloads = [];
  const client = fakeClient({ [MSG.LIST_FOLDERS]: [], [MSG.LIST_POSTS]: [], ...extra });
  const calls = [];
  const app = createApp(ctx.dom, {
    client,
    tabUrl,
    now: () => new Date(),
    openOptions: () => calls.push('options'),
    openUrl: () => {},
    closeWindow: () => calls.push('close'),
    createDownload: (f) => downloads.push(f),
  });
  ctx.document.body.append(app.element);
  await settle();
  const tabs = [...app.element.querySelectorAll('[role="tab"]')];
  return { ...ctx, app, tabs, calls, downloads };
}

test('Save tab opens first on a post tab', async () => {
  const { tabs } = await setup('https://x.com/a/status/1');
  assert.deepEqual(
    tabs.map((t) => t.textContent),
    ['Save', 'Saved'],
  );
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
});

test('Saved tab opens first otherwise', async () => {
  const { tabs, app } = await setup('https://x.com/home');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  const panels = [...app.element.querySelectorAll('[role="tabpanel"]')];
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
});

test('arrow keys move between tabs with roving tabindex', async () => {
  const { window, tabs } = await setup('https://x.com/a/status/1');
  press(window, tabs[0], 'ArrowRight');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[1].getAttribute('tabindex'), '0');
  assert.equal(tabs[0].getAttribute('tabindex'), '-1');
  press(window, tabs[1], 'Home');
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
});

test('header has the wordmark and a Settings button', async () => {
  const { window, app, calls } = await setup('https://x.com/home');
  assert.match(app.element.querySelector('header').textContent, /xmark-manager/);
  const gear = app.element.querySelector('button[aria-label="Settings"]');
  click(window, gear);
  assert.deepEqual(calls, ['options']);
});

test('a quarantined library shows the notice above the tabs; a healthy one does not', async () => {
  const bad = await setup('https://x.com/home', {
    [MSG.GET_STORAGE_STATUS]: { state: 'quarantined', quarantinedAt: '2026-11-21T10:00:00.000Z' },
    [MSG.EXPORT_QUARANTINE]: 'RAW',
  });
  const region = bad.app.element.querySelector('.notice-region');
  const notice = region.querySelector('.quarantine-notice');
  assert.equal(
    region.getAttribute('role'),
    'status',
    'a live region that exists before it is filled',
  );
  assert.match(notice.textContent, /kept a copy/);
  click(bad.window, notice.querySelector('button'));
  await settle();
  assert.equal(bad.downloads[0].text, 'RAW');
  const good = await setup('https://x.com/home', { [MSG.GET_STORAGE_STATUS]: { state: 'ok' } });
  assert.equal(good.app.element.querySelector('.quarantine-notice'), null);
  assert.equal(good.app.element.querySelector('.notice-region').getAttribute('role'), 'status');
});
