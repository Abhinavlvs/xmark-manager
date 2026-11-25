import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, fakeClient, click, settle, textOf } from '../../test-support/dom.js';
import { MSG } from '../../src/platform/messages.js';
import { RequestError } from '../../src/platform/runtime-client.js';
import {
  createQuarantineNotice,
  unreadableFilename,
  copyFilename,
  downloadUnreadableCopy,
  QUARANTINE_TEXT,
} from '../../src/ui/quarantine-notice.js';

const QUARANTINED = {
  state: 'quarantined',
  quarantinedAt: '2026-11-21T10:00:00.000Z',
  reason: 'not_object',
};
const shown = (notice) => notice.element.querySelector('.quarantine-notice') !== null;

function setup(routes) {
  const ctx = makeDom();
  const downloads = [];
  const client = fakeClient(routes);
  const notice = createQuarantineNotice(ctx.dom, {
    client,
    createDownload: (f) => downloads.push(f),
    now: () => new Date(2026, 10, 21, 9, 0),
  });
  ctx.document.body.append(notice.element);
  return { ...ctx, client, downloads, notice };
}

test('the status region exists from the start and is empty for a healthy library', async () => {
  const ok = setup({ [MSG.GET_STORAGE_STATUS]: { state: 'ok' } });
  assert.equal(ok.notice.element.getAttribute('role'), 'status');
  assert.equal(ok.notice.element.hidden, false, 'never un-hidden later: it is populated');
  await ok.notice.refresh();
  assert.equal(shown(ok.notice), false);
  const unknown = setup({});
  await unknown.notice.refresh();
  assert.equal(shown(unknown.notice), false);
});

test('a status that cannot be read is surfaced, not swallowed', async () => {
  const broken = setup({
    [MSG.GET_STORAGE_STATUS]: () => {
      throw new RequestError('storage_read_error');
    },
  });
  await broken.notice.refresh();
  assert.match(textOf(broken.notice.element), /Couldn't read your library\. Try reloading/);
  assert.equal(broken.notice.element.querySelector('button'), null);
});

test('a quarantined library shows the persistent notice inside the status region', async () => {
  const { notice } = setup({ [MSG.GET_STORAGE_STATUS]: QUARANTINED });
  await notice.refresh();
  assert.equal(notice.element.getAttribute('role'), 'status');
  assert.equal(
    textOf(notice.element.querySelector('.notice-text')),
    "We couldn't read your saved library, so we started a fresh one and kept a copy. Export the unreadable copy from Options > Data.",
  );
  assert.equal(QUARANTINE_TEXT, textOf(notice.element.querySelector('.notice-text')));
});

test('the wording follows the reason: dropped records, and an unreadable library', async () => {
  const dropped = setup({
    [MSG.GET_STORAGE_STATUS]: { ...QUARANTINED, reason: 'records_dropped', dropped: 2 },
  });
  await dropped.notice.refresh();
  assert.equal(
    textOf(dropped.notice.element.querySelector('.notice-text')),
    "Some saved posts couldn't be read, so they were left out. A copy of your original data was kept. Export it from Options > Data.",
  );
  const stuck = setup({ [MSG.GET_STORAGE_STATUS]: { state: 'storage_unreadable' } });
  await stuck.notice.refresh();
  assert.equal(
    textOf(stuck.notice.element.querySelector('.notice-text')),
    "Your saved library can't be read right now. Export your data or reload the extension.",
  );
  assert.ok(stuck.notice.element.querySelector('button'), 'export is still offered');
});

test('Export unreadable copy downloads the raw text', async () => {
  const {
    window,
    notice,
    downloads,
    element = notice.element,
  } = setup({
    [MSG.GET_STORAGE_STATUS]: QUARANTINED,
    [MSG.EXPORT_QUARANTINE]: '{corrupt',
  });
  await notice.refresh();
  click(window, element.querySelector('button'));
  await settle();
  assert.deepEqual(downloads, [
    { filename: 'xmark-manager-unreadable-2026-11-21.txt', text: '{corrupt', mime: 'text/plain' },
  ]);
});

test('a failed export shows an alert and the button works again', async () => {
  const { window, notice } = setup({
    [MSG.GET_STORAGE_STATUS]: QUARANTINED,
    [MSG.EXPORT_QUARANTINE]: () => {
      throw new RequestError('NotFoundError');
    },
  });
  await notice.refresh();
  const button = notice.element.querySelector('button');
  click(window, button);
  await settle();
  const alert = notice.element.querySelector('[role="alert"]');
  assert.equal(alert.hidden, false);
  assert.match(alert.textContent, /no longer exists/);
  assert.equal(button.disabled, false);
});

test('unreadableFilename pads month and day', () => {
  assert.equal(unreadableFilename(new Date(2026, 0, 5)), 'xmark-manager-unreadable-2026-01-05.txt');
});

test('the notice says how many copies exist and labels the export button truthfully', async () => {
  const two = setup({
    [MSG.GET_STORAGE_STATUS]: { ...QUARANTINED, copies: [{ n: 1 }, { n: 2 }] },
  });
  await two.notice.refresh();
  assert.match(textOf(two.notice.element), /2 copies of unreadable data are kept on this device\./);
  assert.equal(two.notice.element.querySelector('button').textContent, 'Export unreadable copy');
  const one = setup({ [MSG.GET_STORAGE_STATUS]: { ...QUARANTINED, copies: [{ n: 1 }] } });
  await one.notice.refresh();
  assert.match(textOf(one.notice.element), /1 copy of the unreadable data is kept/);
  const none = setup({ [MSG.GET_STORAGE_STATUS]: { state: 'storage_unreadable', copies: [] } });
  await none.notice.refresh();
  assert.doesNotMatch(textOf(none.notice.element), /kept on this device/);
  assert.equal(none.notice.element.querySelector('button').textContent, 'Export unreadable data');
});

test('a copy export is named by its number and the start of its id', async () => {
  assert.equal(
    copyFilename({ n: 2, id: 'ab12cd34-ffff-4000-8000-000000000000' }),
    'xmark-unreadable-copy-2-ab12cd34.txt',
  );
  const sent = [];
  const files = [];
  await downloadUnreadableCopy({
    client: { request: async (type, payload) => (sent.push([type, payload]), 'RAW') },
    createDownload: (f) => files.push(f),
    now: () => new Date(2026, 10, 21),
    copy: { n: 2, id: 'ab12cd34-ffff' },
  });
  assert.deepEqual(sent[0][1], { n: 2, id: 'ab12cd34-ffff' });
  assert.equal(files[0].filename, 'xmark-unreadable-copy-2-ab12cd34.txt');
});
