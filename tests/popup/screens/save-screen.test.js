import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDom,
  fakeClient,
  click,
  choose,
  typeInto,
  press,
  settle,
  textOf,
} from '../../../test-support/dom.js';
import { RequestError } from '../../../src/platform/runtime-client.js';
import { MSG } from '../../../src/platform/messages.js';
import { createSaveScreen } from '../../../src/popup/screens/save-screen.js';

const POST_TAB = 'https://x.com/ada_builds/status/123456789';
const folders = [{ id: 'f1', name: 'Reading', updated_at: '', deleted: false }];
const existing = {
  id: 'p9',
  url: 'https://x.com/ada_builds/status/123456789',
  author: 'ada_builds',
  text_preview: '',
  folder_id: 'f1',
  tags: ['old'],
  notes: 'old note',
  created_at: '2025-11-21T11:00:00.000Z',
  updated_at: '',
  deleted: false,
};

async function setup({ tabUrl = POST_TAB, routes = {} } = {}) {
  const ctx = makeDom();
  const client = fakeClient({
    [MSG.LIST_FOLDERS]: folders,
    [MSG.LIST_POSTS]: [],
    [MSG.SAVE_POST]: { id: 'new' },
    [MSG.UPDATE_POST]: { id: 'p9' },
    ...routes,
  });
  let done = 0;
  const screen = createSaveScreen(ctx.dom, { client, tabUrl, onDone: () => (done += 1) });
  ctx.document.body.append(screen.element);
  await screen.ready;
  await settle();
  const q = (sel) => screen.element.querySelector(sel);
  const button = (label) =>
    [...screen.element.querySelectorAll('button')].find((b) => textOf(b).includes(label));
  return { ...ctx, client, screen, q, button, done: () => done };
}

test('non-post tab shows the hint, disables Save and sends nothing', async () => {
  const { q, client } = await setup({ tabUrl: 'https://x.com/home' });
  assert.equal(textOf(q('.hint')), 'Open a post on X to save it');
  assert.equal(q('.save-button').hasAttribute('disabled'), true);
  assert.deepEqual(client.calls, []);
});

test('post tab saves with chosen folder, tags and notes and never sends a snippet', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { window, client, q, button, done } = await setup({
    routes: { [MSG.SAVE_POST]: () => gate.then(() => ({ id: 'new' })) },
  });
  choose(window, q('select'), 'f1');
  typeInto(window, q('.tag-input-field'), 'AI');
  press(window, q('.tag-input-field'), 'Enter');
  typeInto(window, q('textarea'), 'worth reading');
  assert.equal(textOf(q('.save-button')), 'Save post');
  click(window, q('.save-button'));
  assert.equal(textOf(q('.save-button')), 'Saving…');
  assert.equal(q('.save-button').hasAttribute('disabled'), true);
  release();
  await settle();
  const save = client.calls.find((c) => c.type === MSG.SAVE_POST);
  assert.deepEqual(save.payload, {
    url: 'https://x.com/ada_builds/status/123456789',
    folderId: 'f1',
    tags: ['ai'],
    notes: 'worth reading',
  });
  assert.match(textOf(q('.note-success')), /Saved/);
  assert.equal(q('.save-button'), null);
  click(window, button('Done'));
  assert.equal(done(), 1);
});

test('already-saved post is detected and offers Update', async () => {
  const { window, client, q } = await setup({ routes: { [MSG.LIST_POSTS]: [existing] } });
  assert.deepEqual(client.calls.find((c) => c.type === MSG.LIST_POSTS).payload, {
    text: '123456789',
  });
  assert.match(textOf(q('.saved-badge')), /Saved/);
  assert.equal(textOf(q('.save-button')), 'Update');
  assert.equal(q('textarea').value, 'old note');
  assert.equal(q('.tag-input .chip').textContent.trim(), '#old');
  typeInto(window, q('textarea'), 'new note');
  click(window, q('.save-button'));
  await settle();
  const upd = client.calls.find((c) => c.type === MSG.UPDATE_POST);
  assert.deepEqual(upd.payload, {
    id: 'p9',
    patch: { folderId: 'f1', tags: ['old'], notes: 'new note' },
  });
  assert.equal(
    client.calls.some((c) => c.type === MSG.SAVE_POST),
    false,
  );
});

test('a failed save shows an inline alert with Retry that resubmits', async () => {
  let fail = true;
  const { window, client, q, button } = await setup({
    routes: {
      [MSG.SAVE_POST]: () => {
        if (fail) throw new RequestError('internal_error');
        return { id: 'new' };
      },
    },
  });
  click(window, q('.save-button'));
  await settle();
  assert.equal(q('.note-error:not([hidden])').getAttribute('role'), 'alert');
  assert.match(textOf(q('.note-error:not([hidden])')), /went wrong/i);
  fail = false;
  click(window, button('Retry'));
  await settle();
  assert.equal(client.calls.filter((c) => c.type === MSG.SAVE_POST).length, 2);
  assert.match(textOf(q('.note-success')), /Saved/);
});

test('a failed initial load shows an alert and Retry reloads', async () => {
  let fail = true;
  const { window, client, q, button } = await setup({
    routes: {
      [MSG.LIST_FOLDERS]: () => {
        if (fail) throw new RequestError('internal_error');
        return folders;
      },
    },
  });
  assert.equal(q('.note-error:not([hidden])').getAttribute('role'), 'alert');
  assert.equal(q('.save-button').hasAttribute('disabled'), true);
  fail = false;
  click(window, button('Retry'));
  await settle();
  assert.equal(q('.note-error:not([hidden])'), null);
  assert.equal(q('.save-button').hasAttribute('disabled'), false);
  assert.ok(client.calls.filter((c) => c.type === MSG.LIST_FOLDERS).length >= 2);
});

test('a storage_full failure shows the library-full text and nothing is marked saved', async () => {
  const { window, q } = await setup({
    routes: {
      [MSG.SAVE_POST]: () => {
        throw new RequestError('storage_full');
      },
    },
  });
  click(window, q('.save-button'));
  await settle();
  assert.equal(q('.note-error:not([hidden])').getAttribute('role'), 'alert');
  assert.match(textOf(q('.note-error:not([hidden])')), /library may be full.*Options > Data/);
  assert.equal(q('.note-success'), null);
});
