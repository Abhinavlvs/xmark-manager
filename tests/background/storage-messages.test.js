import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/background/app.js';
import { MSG } from '../../src/platform/messages.js';
import { fakeArea, quotaError } from '../../test-support/storage-area.js';

const ID = 'ext@id';
const popup = { id: ID, url: 'moz-extension://abc/popup.html' };
const content = { id: ID, url: 'https://x.com/home', tab: { incognito: false } };
const appOn = (area) =>
  buildApp({
    browserApi: {
      storage: { local: area },
      runtime: { id: ID, getURL: () => 'moz-extension://abc/' },
    },
  });
const send = (app, type, payload, sender = popup) => app({ type, payload }, sender);

test('GET_STORAGE_STATUS is ok for a healthy or empty library', async () => {
  const res = await send(appOn(fakeArea()), MSG.GET_STORAGE_STATUS);
  assert.deepEqual(res, { ok: true, data: { state: 'ok' } });
});

test('unreadable data is reported, exportable as raw text, and survives later saves', async () => {
  const area = fakeArea({ 'xmark.doc': '{corrupt' });
  const app = appOn(area);
  const status = (await send(app, MSG.GET_STORAGE_STATUS)).data;
  assert.equal(status.state, 'quarantined');
  assert.equal(typeof status.quarantinedAt, 'string');
  assert.equal((await send(app, MSG.LIST_POSTS)).data.length, 0);
  await send(app, MSG.SAVE_POST, { url: 'https://x.com/a/status/1' });
  assert.deepEqual(await send(app, MSG.EXPORT_QUARANTINE), { ok: true, data: '{corrupt' });
  assert.equal((await send(app, MSG.LIST_POSTS)).data.length, 1);
});

test('EXPORT_QUARANTINE is not_found when nothing was set aside; discard clears the notice', async () => {
  const area = fakeArea({ 'xmark.doc': 'junk' });
  const app = appOn(area);
  assert.equal((await send(appOn(fakeArea()), MSG.EXPORT_QUARANTINE)).error, 'NotFoundError');
  await send(app, MSG.GET_STORAGE_STATUS);
  assert.equal((await send(app, MSG.DISCARD_QUARANTINE, {})).error, 'bad_payload');
  assert.equal((await send(app, MSG.DISCARD_QUARANTINE, { n: 1, all: true })).error, 'bad_payload');
  assert.equal((await send(app, MSG.DISCARD_QUARANTINE, { n: 0 })).error, 'bad_payload');
  assert.equal((await send(app, MSG.EXPORT_QUARANTINE, { n: 1.5, id: 'x' })).error, 'bad_payload');
  assert.equal(
    (await send(app, MSG.EXPORT_QUARANTINE, { n: 1 })).error,
    'bad_payload',
    'id is required',
  );
  assert.equal((await send(app, MSG.DISCARD_QUARANTINE, { n: 1 })).error, 'bad_payload');
  const { id } = (await send(app, MSG.GET_STORAGE_STATUS)).data.copies[0];
  assert.equal(
    (await send(app, MSG.EXPORT_QUARANTINE, { n: 1, id: 'other' })).error,
    'copy_changed',
  );
  assert.equal(
    (await send(app, MSG.DISCARD_QUARANTINE, { n: 1, id: 'other' })).error,
    'copy_changed',
  );
  assert.deepEqual(await send(app, MSG.EXPORT_QUARANTINE, { n: 1, id }), {
    ok: true,
    data: 'junk',
  });
  assert.deepEqual(await send(app, MSG.DISCARD_QUARANTINE, { n: 1, id }), { ok: true });
  assert.equal(area.data['xmark.doc'], 'junk', 'the library itself is never discarded');
});

test('a content script cannot read or export quarantine data', async () => {
  const app = appOn(fakeArea({ 'xmark.doc': 'junk' }));
  for (const type of [MSG.GET_STORAGE_STATUS, MSG.EXPORT_QUARANTINE, MSG.DISCARD_QUARANTINE]) {
    assert.deepEqual(await send(app, type, undefined, content), { ok: false, error: 'rejected' });
  }
});

test('a rejected storage write reaches the caller as storage_full or storage_error', async () => {
  const area = fakeArea();
  const app = appOn(area);
  const save = (n) => send(app, MSG.SAVE_POST, { url: `https://x.com/a/status/${n}` });
  area.state.failSet = quotaError();
  assert.deepEqual(await save(1), { ok: false, error: 'storage_full' });
  area.state.failSet = new Error('disk gone');
  assert.deepEqual(await save(2), { ok: false, error: 'storage_error' });
  area.state.failSet = null;
  assert.equal((await send(app, MSG.LIST_POSTS)).data.length, 0, 'nothing claims to be saved');
  assert.equal((await save(3)).ok, true, 'the queue is still healthy');
  assert.equal((await send(app, MSG.LIST_POSTS)).data.length, 1);
});

const GOOD = {
  id: 'a',
  url: 'https://x.com/a/status/1',
  updated_at: '2026-11-01T00:00:00.000Z',
  created_at: '2026-11-01T00:00:00.000Z',
  deleted: false,
};

test('a dropped record is reported, the rest stays usable, and the copy survives a save', async () => {
  const raw = {
    version: 1,
    folders: [],
    posts: [GOOD, { id: 'b', url: 'https://x.com/a/status/2', tags: 'oops', notes: 'precious' }],
  };
  const app = appOn(fakeArea({ 'xmark.doc': raw }));
  const status = (await send(app, MSG.GET_STORAGE_STATUS)).data;
  assert.equal(status.reason, 'records_dropped');
  assert.equal(status.dropped, 1);
  assert.equal((await send(app, MSG.LIST_POSTS)).data.length, 1);
  await send(app, MSG.SAVE_POST, { url: 'https://x.com/a/status/3' });
  assert.match((await send(app, MSG.EXPORT_QUARANTINE)).data, /precious/);
});

test('when no copy can be written: storage_unreadable, saves refused, export still works', async () => {
  const area = fakeArea({ 'xmark.doc': '{junk' }, { failSet: quotaError() });
  const app = appOn(area);
  assert.deepEqual(await send(app, MSG.GET_STORAGE_STATUS), {
    ok: true,
    data: { state: 'storage_unreadable', copies: [] },
  });
  assert.deepEqual(await send(app, MSG.LIST_POSTS), { ok: false, error: 'storage_unreadable' });
  assert.deepEqual(await send(app, MSG.SAVE_POST, { url: 'https://x.com/a/status/1' }), {
    ok: false,
    error: 'storage_unreadable',
  });
  assert.deepEqual(await send(app, MSG.EXPORT_QUARANTINE), { ok: true, data: '{junk' });
  assert.deepEqual(await send(app, MSG.DISCARD_QUARANTINE, { all: true }), { ok: true });
  assert.equal(area.data['xmark.doc'], '{junk', 'nothing was overwritten');
});

test('a failing read is storage_read_error, distinct from a failing save', async () => {
  const area = { ...fakeArea(), get: async () => Promise.reject(new Error('boom')) };
  assert.deepEqual(await send(appOn(area), MSG.LIST_POSTS), {
    ok: false,
    error: 'storage_read_error',
  });
});

test('delete-all keeps the unreadable copies unless asked to discard them', async () => {
  const area = fakeArea({ 'xmark.doc': '{junk' });
  const app = appOn(area);
  await send(app, MSG.GET_STORAGE_STATUS);
  await send(app, MSG.DELETE_ALL_DATA, { discardCopy: false });
  assert.equal(area.data['xmark.doc.quarantine.1'], '{junk');
  assert.equal((await send(app, MSG.GET_STORAGE_STATUS)).data.state, 'quarantined');
  assert.equal((await send(app, MSG.DELETE_ALL_DATA, { discardCopy: 'yes' })).error, 'bad_payload');
  await send(app, MSG.DELETE_ALL_DATA, { discardCopy: true });
  assert.deepEqual(Object.keys(area.data), []);
});

test('EXPORT_QUARANTINE {current: true} exports the stored unreadable value, extension pages only', async () => {
  const area = fakeArea({ 'xmark.doc': '{cur' });
  const app = appOn(area);
  await send(app, MSG.GET_STORAGE_STATUS);
  area.data['xmark.doc'] = '{newer';
  assert.deepEqual(await send(app, MSG.EXPORT_QUARANTINE, { current: true }), {
    ok: true,
    data: '{newer',
  });
  assert.equal(
    (await send(app, MSG.EXPORT_QUARANTINE, { current: true, n: 1 })).error,
    'bad_payload',
  );
  assert.equal((await send(app, MSG.EXPORT_QUARANTINE, { current: 'yes' })).error, 'bad_payload');
  assert.deepEqual(await send(app, MSG.EXPORT_QUARANTINE, { current: true }, content), {
    ok: false,
    error: 'rejected',
  });
  area.data['xmark.doc'] = { version: 1, folders: [], posts: [] };
  assert.equal((await send(app, MSG.EXPORT_QUARANTINE, { current: true })).error, 'NotFoundError');
});

test('delete-all with an uncopied unreadable value and no free slot is refused; nothing is deleted', async () => {
  const data = { 'xmark.doc': '{v6', 'xmark.settings': { saveSnippets: true } };
  for (let n = 1; n <= 5; n += 1) data[`xmark.doc.quarantine.${n}`] = `v${n}`;
  const area = fakeArea(data);
  const app = appOn(area);
  assert.deepEqual(await send(app, MSG.DELETE_ALL_DATA), {
    ok: false,
    error: 'storage_unreadable',
  });
  assert.equal(area.data['xmark.doc'], '{v6');
  assert.deepEqual(area.data['xmark.settings'], { saveSnippets: true }, 'settings are put back');
  await send(app, MSG.DISCARD_QUARANTINE, { all: true });
  assert.deepEqual(
    await send(app, MSG.DELETE_ALL_DATA),
    { ok: true },
    'a free slot: copy, then delete',
  );
  assert.equal(area.data['xmark.doc.quarantine.1'], '{v6');
  assert.equal('xmark.doc' in area.data, false);
});
