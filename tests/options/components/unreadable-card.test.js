import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, fakeClient, click, settle, textOf } from '../../../test-support/dom.js';
import { MSG } from '../../../src/platform/messages.js';
import { RequestError } from '../../../src/platform/runtime-client.js';
import { createUnreadableCard } from '../../../src/options/components/unreadable-card.js';

const copy = (n, over = {}) => ({
  n,
  id: `id${n}-aaaaaaaa`,
  at: `2026-11-2${n}T10:00:00.000Z`,
  reason: 'not_object',
  bytes: 2048 * n,
  ...over,
});

function setup(initial = [copy(1), copy(2, { reason: 'records_dropped', dropped: 1 })]) {
  const ctx = makeDom();
  const downloads = [];
  const said = [];
  let changed = 0;
  let copies = initial;
  let unreadable = false;
  let stale = false;
  const client = fakeClient({
    [MSG.GET_STORAGE_STATUS]: () =>
      unreadable
        ? { state: 'storage_unreadable', copies }
        : copies.length
          ? { state: 'quarantined', quarantinedAt: copies.at(-1).at, reason: 'x', copies }
          : { state: 'ok' },
    [MSG.EXPORT_QUARANTINE]: (p) => {
      if (stale) throw new RequestError('copy_changed');
      return `RAW-${p?.n ?? (p?.current ? 'current' : 'newest')}`;
    },
    [MSG.DISCARD_QUARANTINE]: (p) => {
      if (stale) throw new RequestError('copy_changed');
      copies = copies.filter((c) => c.n !== p.n);
    },
  });
  const card = createUnreadableCard(ctx.dom, {
    client,
    createDownload: (f) => downloads.push(f),
    now: () => new Date(2026, 10, 21),
    announce: (t) => said.push(t),
    onChange: () => (changed += 1),
  });
  ctx.document.body.append(card.element);
  const rows = () => [...card.element.querySelectorAll('.copy-row')];
  const btn = (root, label) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent === label);
  return {
    ...ctx,
    client,
    downloads,
    said,
    card,
    rows,
    btn,
    changed: () => changed,
    goStale: () => (stale = true),
    makeFull: () => {
      copies = [1, 2, 3, 4, 5].map((n) => copy(n));
      unreadable = true;
    },
    makeUnreadable: () => {
      copies = [];
      unreadable = true;
    },
  };
}

test('hidden while the library is fine; one row per copy with date, reason and size', async () => {
  const ok = setup([]);
  await ok.card.refresh();
  assert.equal(ok.card.element.hidden, true);
  const s = setup();
  const status = await s.card.refresh();
  assert.equal(status.copies.length, 2);
  assert.equal(s.card.element.hidden, false);
  assert.equal(s.rows().length, 2);
  assert.match(textOf(s.rows()[0]), /Copy 1: 2026-11-21, unreadable data, 2 KB/);
  assert.match(textOf(s.rows()[1]), /Copy 2: 2026-11-22, some records left out, 4 KB/);
  assert.match(textOf(s.card.element), /A copy of that data is kept/);
  assert.match(textOf(s.card.element), /Only discarding a copy frees a slot/);
  assert.doesNotMatch(textOf(s.card.element), /current unreadable value/i);
});

test('each copy exports by its own number', async () => {
  const { window, card, rows, btn, downloads, client } = setup();
  await card.refresh();
  click(window, btn(rows()[1], 'Export'));
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.EXPORT_QUARANTINE).payload, {
    n: 2,
    id: 'id2-aaaaaaaa',
  });
  assert.deepEqual(
    downloads.map((d) => [d.text, d.mime]),
    [['RAW-2', 'text/plain']],
  );
});

test('discard asks first, deletes only that copy after confirming, then refreshes and tells the shell', async () => {
  const { window, card, rows, btn, client, said, changed } = setup();
  await card.refresh();
  click(window, btn(rows()[0], 'Discard'));
  assert.equal(rows()[0].querySelector('.unreadable-panel').hidden, false);
  assert.equal(
    client.calls.some((c) => c.type === MSG.DISCARD_QUARANTINE),
    false,
  );
  click(window, btn(rows()[0], 'Discard copy'));
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.DISCARD_QUARANTINE).payload, {
    n: 1,
    id: 'id1-aaaaaaaa',
  });
  assert.equal(rows().length, 1);
  assert.match(textOf(rows()[0]), /Copy 2/);
  assert.equal(changed(), 1);
  assert.deepEqual(said, ['Copy 1 was discarded.']);
});

test('cancelling keeps the copy', async () => {
  const { window, card, rows, btn, client } = setup();
  await card.refresh();
  click(window, btn(rows()[0], 'Discard'));
  click(window, btn(rows()[0], 'Cancel'));
  assert.equal(
    client.calls.some((c) => c.type === MSG.DISCARD_QUARANTINE),
    false,
  );
  assert.equal(rows().length, 2);
});

test('with no copy the text does not claim one exists, export offers the data, discard is disabled', async () => {
  const s = setup();
  s.makeUnreadable();
  await s.card.refresh();
  assert.equal(s.card.element.hidden, false);
  const text = textOf(s.card.element);
  assert.doesNotMatch(text, /A copy of the original data is kept/);
  assert.match(text, /no copy could be made/);
  assert.match(text, /There is no copy to discard/);
  assert.equal(s.btn(s.card.element, 'Discard').disabled, true);
  click(s.window, s.btn(s.card.element, 'Export unreadable data'));
  await settle();
  assert.equal(s.downloads[0].text, 'RAW-newest');
});

test('with five copies and an uncopied unreadable value, the current value has its own export', async () => {
  const s = setup();
  s.makeFull();
  await s.card.refresh();
  const text = textOf(s.card.element);
  assert.match(text, /no copy of its own/);
  assert.match(text, /Only discarding a copy frees a slot/);
  assert.doesNotMatch(text, /A copy of that data is kept/);
  click(s.window, s.btn(s.card.element, 'Export current unreadable value'));
  await settle();
  assert.deepEqual(s.client.calls.find((c) => c.type === MSG.EXPORT_QUARANTINE).payload, {
    current: true,
  });
  assert.equal(s.downloads[0].text, 'RAW-current');
});

test('per-copy buttons have distinct accessible names', async () => {
  const s = setup();
  await s.card.refresh();
  const names = [...s.card.element.querySelectorAll('.copy-row button')].map((b) =>
    b.getAttribute('aria-label'),
  );
  assert.deepEqual(names.filter(Boolean), [
    'Export copy 1',
    'Discard copy 1',
    'Export copy 2',
    'Discard copy 2',
  ]);
});

test('a stale export says the copy changed, refreshes the list and downloads nothing', async () => {
  const s = setup();
  await s.card.refresh();
  const before = s.client.calls.filter((c) => c.type === MSG.GET_STORAGE_STATUS).length;
  s.goStale();
  click(s.window, s.btn(s.rows()[1], 'Export'));
  await settle();
  const note = s.card.element.querySelector('[role="status"]');
  assert.equal(textOf(note), 'That copy changed. The list was refreshed.');
  assert.equal(s.downloads.length, 0);
  assert.equal(s.client.calls.filter((c) => c.type === MSG.GET_STORAGE_STATUS).length, before + 1);
  assert.equal(s.card.element.querySelector('[role="alert"]').hidden, true);
});

test('a stale discard says the copy changed, refreshes, and tells the shell nothing', async () => {
  const s = setup();
  await s.card.refresh();
  s.goStale();
  click(s.window, s.btn(s.rows()[0], 'Discard'));
  click(s.window, s.btn(s.rows()[0], 'Discard copy'));
  await settle();
  assert.equal(
    textOf(s.card.element.querySelector('[role="status"]')),
    'That copy changed. The list was refreshed.',
  );
  assert.equal(s.changed(), 0);
  assert.equal(s.said.length, 0);
});
