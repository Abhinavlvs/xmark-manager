import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDom,
  fakeClient,
  click,
  typeInto,
  settle,
  textOf,
  trackFocus,
  choose,
} from '../../../test-support/dom.js';
import { RequestError } from '../../../src/platform/runtime-client.js';
import { MSG } from '../../../src/platform/messages.js';
import { filterPosts } from '../../../src/core/search.js';
import { createSavedScreen } from '../../../src/ui/saved/saved-screen.js';

const folders = [
  { id: 'f1', name: 'Reading', updated_at: '', deleted: false },
  { id: 'f2', name: 'Code', updated_at: '', deleted: false },
];
const mk = (id, over = {}) => ({
  id,
  url: `https://x.com/user${id}/status/${id}00`,
  author: `user${id}`,
  text_preview: `snippet ${id}`,
  folder_id: null,
  tags: [],
  notes: '',
  created_at: '2025-11-21T11:00:00.000Z',
  updated_at: '',
  deleted: false,
  ...over,
});
const sample = [
  mk('1', { folder_id: 'f1', tags: ['ai'], notes: 'n1' }),
  mk('2', { tags: ['rust'] }),
  mk('3', { folder_id: 'f2' }),
];

async function setup({ posts = sample, routes = {} } = {}) {
  const ctx = makeDom();
  const client = fakeClient({
    [MSG.LIST_FOLDERS]: folders,
    [MSG.LIST_POSTS]: (q) => filterPosts(posts, q ?? {}),
    [MSG.DELETE_POST]: undefined,
    [MSG.SAVE_POST]: { id: 'back' },
    [MSG.UPDATE_POST]: { id: '1' },
    [MSG.CREATE_FOLDER]: (p) => ({ id: 'f9', name: p.name, updated_at: '', deleted: false }),
    ...routes,
  });
  const opened = [];
  const focused = trackFocus(ctx.window);
  let pending = null;
  let goSave = 0;
  const screen = createSavedScreen(ctx.dom, {
    client,
    now: () => new Date('2025-11-21T12:00:00.000Z'),
    onOpenUrl: (u) => opened.push(u),
    onGoSave: () => (goSave += 1),
    setTimer: (fn, ms) => {
      pending = { fn, ms };
      return 1;
    },
    clearTimer: () => {
      pending = null;
    },
    snackbarOptions: { setTimer: () => 0, clearTimer: () => {} },
  });
  const flush = async () => {
    const p = pending;
    pending = null;
    p?.fn();
    await settle();
  };
  ctx.document.body.append(screen.element);
  await screen.ready;
  await settle();
  const q = (sel) => screen.element.querySelector(sel);
  const qa = (sel) => [...screen.element.querySelectorAll(sel)];
  const btn = (label, root = screen.element) =>
    [...root.querySelectorAll('button')].find((b) => textOf(b).includes(label));
  const lastList = () => client.calls.filter((c) => c.type === MSG.LIST_POSTS).at(-1).payload;
  return {
    ...ctx,
    client,
    screen,
    q,
    qa,
    btn,
    opened,
    lastList,
    flush,
    focused,
    pending: () => pending,
    goSave: () => goSave,
  };
}

test('lists cards and folder chips with counts', async () => {
  const { qa, q } = await setup();
  assert.equal(qa('.post-card').length, 3);
  const chips = qa('.filter-chips button').map((b) => textOf(b));
  assert.deepEqual(chips, ['All 3', 'Uncategorised 1', 'Code 1', 'Reading 1']);
  assert.equal(q('.filter-chips button[aria-pressed="true"]').textContent.includes('All'), true);
});

test('typing in search requests LIST_POSTS with {text}', async () => {
  const { window, q, qa, lastList, flush } = await setup();
  typeInto(window, q('input[type="search"]'), 'rust');
  await flush();
  assert.deepEqual(lastList(), { text: 'rust' });
  assert.equal(qa('.post-card').length, 1);
});

test('folder chips set folderId, null for Uncategorised, and All clears it', async () => {
  const { window, btn, lastList, qa } = await setup();
  click(window, btn('Uncategorised'));
  await settle();
  assert.deepEqual(lastList(), { folderId: null });
  assert.equal(qa('.post-card').length, 1);
  click(window, btn('Reading'));
  await settle();
  assert.deepEqual(lastList(), { folderId: 'f1' });
  click(window, btn('All'));
  await settle();
  assert.deepEqual(lastList(), {});
});

test('clicking a tag filters by tag and shows a removable tag filter', async () => {
  const { window, btn, lastList, qa, q } = await setup();
  click(window, btn('#ai'));
  await settle();
  assert.deepEqual(lastList(), { tag: 'ai' });
  assert.equal(qa('.post-card').length, 1);
  click(window, q('.tag-filter button'));
  await settle();
  assert.deepEqual(lastList(), {});
});

test('delete removes the card, shows the snackbar, and Undo re-saves the same post', async () => {
  const { window, btn, client, q, qa } = await setup();
  const card = qa('.post-card')[0];
  const id = card.dataset.id;
  assert.equal(id, '1');
  click(window, btn('Delete', card));
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.DELETE_POST).payload, { id: '1' });
  assert.match(textOf(q('.snackbar')), /Post deleted/);
  click(window, btn('Undo', q('.snackbar')));
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.SAVE_POST).payload, {
    url: sample[0].url,
    folderId: 'f1',
    tags: ['ai'],
    notes: 'n1',
  });
});

test('empty library and no-results states', async () => {
  const empty = await setup({ posts: [] });
  assert.match(textOf(empty.q('.empty-state')), /Nothing saved yet/);
  const { window, q, flush } = await setup();
  typeInto(window, q('input[type="search"]'), 'zzzz');
  await flush();
  assert.match(textOf(q('.empty-state')), /No matching posts/);
});

test('a failed load shows an alert with Retry', async () => {
  let fail = true;
  const { window, q, btn, qa } = await setup({
    routes: {
      [MSG.LIST_POSTS]: () => {
        if (fail) throw new RequestError('internal_error');
        return sample;
      },
    },
  });
  assert.equal(q('[role="alert"]:not([hidden])').textContent.includes('Could not load'), true);
  fail = false;
  click(window, btn('Retry'));
  await settle();
  assert.equal(qa('.post-card').length, 3);
});

test('Edit saves tags and notes via UPDATE_POST', async () => {
  const { window, btn, client, q, qa } = await setup();
  click(window, btn('Edit', qa('.post-card')[0]));
  const notes = q('.post-editor textarea');
  assert.equal(notes.value, 'n1');
  typeInto(window, notes, 'changed');
  click(window, btn('Save', q('.post-editor')));
  await settle();
  const upd = client.calls.find((c) => c.type === MSG.UPDATE_POST);
  assert.deepEqual(upd.payload, { id: '1', patch: { tags: ['ai'], notes: 'changed' } });
  assert.equal(q('.post-editor'), null);
});

test('Move changes only the folder via UPDATE_POST', async () => {
  const { window, btn, client, q, qa } = await setup();
  click(window, btn('Move', qa('.post-card')[1]));
  choose(window, q('.post-editor select'), 'f2');
  click(window, btn('Save', q('.post-editor')));
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.UPDATE_POST).payload, {
    id: '2',
    patch: { folderId: 'f2' },
  });
});

test('Open on X delegates to onOpenUrl', async () => {
  const { window, qa, opened } = await setup();
  click(window, qa('.post-card a')[0]);
  assert.deepEqual(opened, [sample[0].url]);
});

test('search is debounced by 200ms: many keystrokes, one request', async () => {
  const { window, q, client, flush, pending } = await setup();
  const before = client.calls.length;
  for (const v of ['r', 'ru', 'rus']) typeInto(window, q('input[type="search"]'), v);
  assert.equal(pending().ms, 200);
  assert.equal(client.calls.length, before);
  await flush();
  const lists = client.calls.slice(before).filter((c) => c.type === MSG.LIST_POSTS);
  assert.deepEqual(
    lists.map((c) => c.payload),
    [{ text: 'rus' }],
  );
});

test('an older slower response never overwrites a newer one', async () => {
  const gates = {};
  const { window, q, qa, flush } = await setup({
    routes: {
      [MSG.LIST_POSTS]: (p) =>
        p?.text === 'user1'
          ? new Promise((r) => (gates.slow = () => r(filterPosts(sample, p))))
          : filterPosts(sample, p ?? {}),
    },
  });
  typeInto(window, q('input[type="search"]'), 'user1');
  await flush();
  typeInto(window, q('input[type="search"]'), 'user2');
  await flush();
  assert.deepEqual(
    qa('.post-card').map((c) => c.dataset.id),
    ['2'],
  );
  gates.slow();
  await settle();
  assert.deepEqual(
    qa('.post-card').map((c) => c.dataset.id),
    ['2'],
  );
});

test('Undo still works after the list changed and refreshes with the current query', async () => {
  const { window, btn, client, q, qa, flush, lastList } = await setup();
  click(window, btn('Delete', qa('.post-card')[0]));
  await settle();
  typeInto(window, q('input[type="search"]'), 'rust');
  await flush();
  click(window, btn('Undo', q('.snackbar')));
  await settle();
  assert.deepEqual(client.calls.find((c) => c.type === MSG.SAVE_POST).payload, {
    url: sample[0].url,
    folderId: 'f1',
    tags: ['ai'],
    notes: 'n1',
  });
  assert.deepEqual(lastList(), { text: 'rust' });
});

test('an open editor keeps its input and focus is not stolen by later refreshes', async () => {
  const { window, btn, q, qa, flush, focused } = await setup();
  click(window, btn('Edit', qa('.post-card')[0]));
  await settle();
  const editorFocus = focused.filter((n) => n.closest?.('.post-editor')).length;
  assert.equal(editorFocus, 1);
  typeInto(window, q('.post-editor textarea'), 'half typed');
  focused.length = 0;
  typeInto(window, q('input[type="search"]'), 'user1');
  await flush();
  assert.equal(q('.post-editor textarea').value, 'half typed');
  assert.equal(
    focused.some((n) => n.closest?.('.post-editor')),
    false,
  );
});

test('after deleting a card focus moves to the next card, else the search field', async () => {
  const live = [...sample];
  const { window, btn, qa, q, focused } = await setup({
    posts: live,
    routes: {
      [MSG.DELETE_POST]: ({ id }) =>
        live.splice(
          live.findIndex((p) => p.id === id),
          1,
        ),
    },
  });
  const search = q('input[type="search"]');
  focused.length = 0;
  click(window, btn('Delete', qa('.post-card')[0]));
  await settle();
  const next = focused.at(-1);
  assert.equal(next.closest('.post-card').dataset.id, '2');
  assert.match(textOf(next), /Open on X/);
  for (let i = 0; i < 2; i += 1) {
    click(window, btn('Delete', qa('.post-card')[0]));
    await settle();
  }
  assert.equal(focused.at(-1), search);
});

test('an empty library hides search and chips and points to the Save tab', async () => {
  const { window, q, btn, goSave } = await setup({
    posts: [],
    routes: { [MSG.LIST_FOLDERS]: [] },
  });
  assert.equal(q('.filters').hidden, true);
  click(window, btn('How to save a post'));
  assert.equal(goSave(), 1);
});

test('the snackbar comes before the list in DOM order', async () => {
  const { q, screen } = await setup();
  const kids = [...screen.element.children];
  assert.ok(kids.indexOf(q('.snackbar-host')) < kids.indexOf(q('.list')));
});
