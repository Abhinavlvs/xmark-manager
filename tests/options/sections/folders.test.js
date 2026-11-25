import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDom,
  fakeClient,
  click,
  press,
  fire,
  typeInto,
  settle,
  textOf,
  trackFocus,
} from '../../../test-support/dom.js';
import { MSG } from '../../../src/platform/messages.js';
import { RequestError } from '../../../src/platform/runtime-client.js';
import { createFoldersSection } from '../../../src/options/sections/folders.js';

const FOLDERS = [
  { id: 'f2', name: 'Ideas' },
  { id: 'f1', name: 'Reading' },
];
const POSTS = [{ folder_id: 'f1' }, { folder_id: 'f1' }, { folder_id: 'f1' }, { folder_id: null }];

async function setup({ routes = {}, folders = FOLDERS } = {}) {
  const ctx = makeDom();
  const focused = trackFocus(ctx.window);
  const said = [];
  const client = fakeClient({
    [MSG.LIST_FOLDERS]: () => folders,
    [MSG.LIST_POSTS]: POSTS,
    ...routes,
  });
  const section = createFoldersSection(ctx.dom, { client, announce: (t) => said.push(t) });
  ctx.document.body.append(section.element);
  await section.load();
  const q = (sel) => section.element.querySelector(sel);
  return { ...ctx, focused, said, client, section, q };
}
const rowFor = (q, name) =>
  [...q('ul').querySelectorAll('li')].find(
    (li) =>
      li.querySelector('.folder-main')?.textContent.includes(name) ||
      li.querySelector(`[aria-label="Rename ${name}"]`),
  );

test('lists folders by name with post counts, plus a read-only Uncategorised row', async () => {
  const { q } = await setup();
  const rows = [...q('ul').querySelectorAll('li')].map(
    (li) =>
      textOf(li.querySelector('.folder-main')) + '|' + textOf(li.querySelector('.folder-count')),
  );
  assert.deepEqual(rows, ['Ideas|0 posts', 'Reading|3 posts', 'Uncategorised|1 post']);
  const uncat = rowFor(q, 'Uncategorised');
  assert.equal(uncat.querySelectorAll('button').length, 0);
});

test('shows a calm empty note when there are no folders', async () => {
  const { section } = await setup({ folders: [] });
  assert.match(section.element.textContent, /No folders yet/);
});

test('create sends the trimmed name, refreshes and announces', async () => {
  let list = [...FOLDERS];
  const { window, q, client, said } = await setup({
    routes: {
      [MSG.LIST_FOLDERS]: () => list,
      [MSG.CREATE_FOLDER]: (p) => {
        list = [...list, { id: 'n', name: p.name }];
        return { id: 'n', name: p.name };
      },
    },
  });
  const input = q('form.folder-create input');
  assert.equal(input.getAttribute('maxlength'), '80');
  typeInto(window, input, '  Archive  ');
  fire(window, q('form.folder-create'), 'submit');
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.CREATE_FOLDER).payload, {
    name: 'Archive',
  });
  assert.ok(rowFor(q, 'Archive'));
  assert.equal(input.value, '');
  assert.deepEqual(said, ['Folder "Archive" created.']);
});

test('create shows the server error as an alert and an empty name is not sent', async () => {
  const { window, q, client } = await setup({
    routes: {
      [MSG.CREATE_FOLDER]: () => {
        throw new RequestError('InvalidFolderNameError');
      },
    },
  });
  fire(window, q('form.folder-create'), 'submit');
  await settle();
  assert.equal(
    client.calls.some((c) => c.type === MSG.CREATE_FOLDER),
    false,
  );
  assert.equal(q('.folder-create [role="alert"]').hidden, false);
  typeInto(window, q('form.folder-create input'), 'x');
  fire(window, q('form.folder-create'), 'submit');
  await settle();
  assert.match(q('.folder-create [role="alert"]').textContent, /not valid/);
});

test('rename: Enter saves the new name, Escape cancels', async () => {
  const { window, q, client, focused } = await setup();
  const row = () => rowFor(q, 'Reading');
  click(window, row().querySelector('[aria-label="Rename Reading"]'));
  const input = row().querySelector('input');
  assert.equal(input.value, 'Reading');
  press(window, input, 'Escape');
  assert.equal(row().querySelector('input'), null);
  assert.equal(focused.at(-1).getAttribute('aria-label'), 'Rename Reading');
  click(window, row().querySelector('[aria-label="Rename Reading"]'));
  typeInto(window, row().querySelector('input'), 'Long reads');
  fire(window, row().querySelector('form'), 'submit');
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.RENAME_FOLDER).payload, {
    id: 'f1',
    name: 'Long reads',
  });
});

test('rename error is shown in the row', async () => {
  const { window, q } = await setup({
    routes: {
      [MSG.RENAME_FOLDER]: () => {
        throw new RequestError('InvalidFolderNameError');
      },
    },
  });
  click(window, rowFor(q, 'Reading').querySelector('[aria-label="Rename Reading"]'));
  fire(window, rowFor(q, 'Reading').querySelector('form'), 'submit');
  await settle();
  assert.equal(rowFor(q, 'Reading').querySelector('[role="alert"]').hidden, false);
});

test('delete asks inline, states the post count and that posts become Uncategorised', async () => {
  let list = [...FOLDERS];
  const { window, q, client, said } = await setup({
    routes: {
      [MSG.LIST_FOLDERS]: () => list,
      [MSG.DELETE_FOLDER]: () => {
        list = list.filter((f) => f.id !== 'f1');
      },
    },
  });
  const row = rowFor(q, 'Reading');
  click(window, row.querySelector('[aria-label="Delete Reading"]'));
  await settle();
  const panel = row.querySelector('.confirm-panel');
  assert.equal(panel.hidden, false);
  assert.match(
    panel.textContent,
    /Delete "Reading"\? Its 3 posts will become Uncategorised\. The posts are not deleted\./,
  );
  assert.equal(
    client.calls.some((c) => c.type === MSG.DELETE_FOLDER),
    false,
  );
  click(
    window,
    [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Delete folder'),
  );
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.DELETE_FOLDER).payload, { id: 'f1' });
  assert.equal(rowFor(q, 'Reading'), undefined);
  assert.deepEqual(said, ['Folder "Reading" deleted. Its posts are now Uncategorised.']);
});

test('folder names are shown as text, never parsed as HTML', async () => {
  const evil = '<img src=x onerror=1>';
  const { section } = await setup({ folders: [{ id: 'x', name: evil }] });
  assert.equal(section.element.querySelector('img'), null);
  assert.match(section.element.textContent, /<img src=x onerror=1>/);
});

test('a failed load shows an alert instead of a list', async () => {
  const ctx = makeDom();
  const client = fakeClient({
    [MSG.LIST_FOLDERS]: () => {
      throw new RequestError('unavailable');
    },
  });
  const section = createFoldersSection(ctx.dom, { client, announce: () => {} });
  await section.load();
  assert.equal(section.element.querySelector('.load-error').hidden, false);
});

test('create cannot be submitted twice while the first request is running', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { window, q, client } = await setup({
    routes: { [MSG.CREATE_FOLDER]: () => gate.then(() => ({ id: 'n', name: 'Once' })) },
  });
  typeInto(window, q('form.folder-create input'), 'Once');
  fire(window, q('form.folder-create'), 'submit');
  fire(window, q('form.folder-create'), 'submit');
  assert.equal(q('form.folder-create button[type="submit"]').disabled, true);
  release();
  await settle();
  assert.equal(client.calls.filter((c) => c.type === MSG.CREATE_FOLDER).length, 1);
  assert.equal(q('form.folder-create button[type="submit"]').disabled, false);
});

test('a duplicate folder name shows its own message', async () => {
  const { window, q } = await setup({
    routes: {
      [MSG.CREATE_FOLDER]: () => {
        throw new RequestError('FolderNameTakenError');
      },
    },
  });
  typeInto(window, q('form.folder-create input'), 'Reading');
  fire(window, q('form.folder-create'), 'submit');
  await settle();
  assert.equal(
    q('.folder-create [role="alert"]').textContent,
    'You already have a folder with that name.',
  );
});

test('the delete confirmation refreshes the post count when it opens', async () => {
  let posts = POSTS;
  const { window, q } = await setup({ routes: { [MSG.LIST_POSTS]: () => posts } });
  posts = [...POSTS, { folder_id: 'f1' }, { folder_id: 'f1' }];
  const row = rowFor(q, 'Reading');
  click(window, row.querySelector('[aria-label="Delete Reading"]'));
  await settle();
  assert.match(row.querySelector('.confirm-panel').textContent, /Its 5 posts will become/);
});

test('focus moves to the page heading after a delete and to the renamed row after a rename', async () => {
  let list = [...FOLDERS];
  const { window, q, focused } = await setup({
    routes: {
      [MSG.LIST_FOLDERS]: () => list,
      [MSG.DELETE_FOLDER]: () => {
        list = list.filter((f) => f.id !== 'f1');
      },
      [MSG.RENAME_FOLDER]: (p) => {
        list = list.map((f) => (f.id === p.id ? { ...f, name: p.name } : f));
      },
    },
  });
  click(window, rowFor(q, 'Ideas').querySelector('[aria-label="Rename Ideas"]'));
  typeInto(window, rowFor(q, 'Ideas').querySelector('input'), 'Sparks');
  fire(window, rowFor(q, 'Ideas').querySelector('form'), 'submit');
  await settle();
  assert.equal(focused.at(-1).getAttribute('aria-label'), 'Rename Sparks');
  const row = rowFor(q, 'Reading');
  click(window, row.querySelector('[aria-label="Delete Reading"]'));
  await settle();
  const confirm = [...row.querySelectorAll('button')].find(
    (b) => b.textContent === 'Delete folder',
  );
  click(window, confirm);
  await settle();
  assert.equal(focused.at(-1), q('h1'));
});

test('rename focus and announcement use the cleaned name the background stored', async () => {
  let list = [...FOLDERS];
  const { window, q, focused, said } = await setup({
    routes: {
      [MSG.LIST_FOLDERS]: () => list,
      [MSG.RENAME_FOLDER]: (p) => {
        const name = p.name.replace(/\s+/g, ' ');
        list = list.map((f) => (f.id === p.id ? { ...f, name } : f));
        return { id: p.id, name };
      },
    },
  });
  click(window, rowFor(q, 'Ideas').querySelector('[aria-label="Rename Ideas"]'));
  typeInto(window, rowFor(q, 'Ideas').querySelector('input'), 'Spark     Club');
  fire(window, rowFor(q, 'Ideas').querySelector('form'), 'submit');
  await settle();
  assert.equal(focused.at(-1).getAttribute('aria-label'), 'Rename Spark Club');
  assert.equal(said.at(-1), 'Folder renamed to "Spark Club".');
});
