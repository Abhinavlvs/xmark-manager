import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDom,
  fakeClient,
  click,
  fire,
  typeInto,
  press,
  settle,
  textOf,
  trackFocus,
  choose,
} from '../../../test-support/dom.js';
import { MSG } from '../../../src/platform/messages.js';
import { createSavedSection } from '../../../src/options/sections/saved.js';

const folders = [
  { id: 'f1', name: 'Reading', updated_at: '', deleted: false },
  { id: 'f2', name: 'Code', updated_at: '', deleted: false },
];
const mk = (n, over = {}) => ({
  id: `p${n}`,
  url: `https://x.com/user${n}/status/${1000 + n}`,
  author: `user${n}`,
  text_preview: `snippet ${n}`,
  folder_id: null,
  tags: [],
  notes: '',
  created_at: new Date(Date.UTC(2025, 0, 1, 0, n)).toISOString(),
  updated_at: '',
  deleted: false,
  ...over,
});
const many = (count) => Array.from({ length: count }, (_, i) => mk(i + 1));

async function setup({ posts = [], routes = {}, shown = true } = {}) {
  const ctx = makeDom();
  const focused = trackFocus(ctx.window);
  const server = { posts: [...posts], folders: [...folders] };
  const client = fakeClient({
    [MSG.LIST_FOLDERS]: () => server.folders,
    [MSG.LIST_POSTS]: () => server.posts,
    [MSG.DELETE_POST]: (p) => {
      server.posts = server.posts.filter((x) => x.id !== p.id);
    },
    [MSG.SAVE_POST]: { id: 'back' },
    [MSG.UPDATE_POST]: { id: 'p1' },
    [MSG.CREATE_FOLDER]: (p) => ({ id: 'f9', name: p.name, updated_at: '', deleted: false }),
    ...routes,
  });
  const opened = [];
  const announced = [];
  let pending = null;
  const section = createSavedSection(ctx.dom, {
    client,
    announce: (t) => announced.push(t),
    now: () => new Date('2025-01-02T00:00:00.000Z'),
    openUrl: (u) => opened.push(u),
    win: ctx.window,
    setTimer: (fn, ms) => {
      pending = { fn, ms };
      return 1;
    },
    clearTimer: () => {
      pending = null;
    },
    snackbarOptions: { setTimer: () => 0, clearTimer: () => {} },
  });
  ctx.document.body.append(section.element);
  section.element.hidden = !shown;
  section.load();
  await settle();
  const q = (sel) => section.element.querySelector(sel);
  const qa = (sel) => [...section.element.querySelectorAll(sel)];
  const flush = async () => {
    const p = pending;
    pending = null;
    p?.fn();
    await settle();
  };
  const ids = () => qa('.post-card').map((c) => c.dataset.id);
  const button = (root, label) =>
    [...root.querySelectorAll('button')].find((b) => textOf(b).startsWith(label));
  const chip = (label) => button(q('.filter-chips'), label);
  return {
    ...ctx,
    focused,
    server,
    client,
    section,
    q,
    qa,
    flush,
    ids,
    button,
    chip,
    opened,
    announced,
    pending: () => pending,
  };
}

const msgCount = (client, type) => client.calls.filter((c) => c.type === type).length;

test('empty library shows the empty state and no filters', async () => {
  const t = await setup();
  assert.match(textOf(t.section.element), /Nothing saved yet/);
  assert.match(textOf(t.section.element), /click the toolbar button/);
  assert.equal(t.q('.filters').hidden, true);
  assert.equal(t.qa('.post-card').length, 0);
  assert.equal(t.q('.show-more'), null);
  assert.equal(t.q('h1').textContent, 'Saved');
});

test('lists posts newest first with a count and the search box labelled', async () => {
  const t = await setup({ posts: many(3) });
  assert.deepEqual(t.ids(), ['p3', 'p2', 'p1']);
  assert.equal(textOf(t.q('.saved-count')), '3 posts');
  assert.equal(t.q('input[type="search"]').getAttribute('aria-label'), 'Search saved posts');
  assert.equal(t.q('.saved-count').getAttribute('aria-live'), 'polite');
  assert.equal(textOf(t.q('.post-card .open-link')), 'Open on X');
});

test('one post is singular', async () => {
  const t = await setup({ posts: many(1) });
  assert.equal(textOf(t.q('.saved-count')), '1 post');
});

test('120 posts render 50 at a time with Show more and a status line', async () => {
  const t = await setup({ posts: many(120) });
  assert.equal(t.ids().length, 50);
  assert.equal(textOf(t.q('.saved-count')), '120 posts');
  assert.match(textOf(t.q('.show-more-status')), /Showing 50 of 120/);
  assert.equal(t.q('.show-more-status').getAttribute('aria-live'), 'polite');
  click(t.window, t.q('.show-more'));
  await settle();
  assert.equal(t.ids().length, 100);
  assert.match(textOf(t.q('.show-more-status')), /Showing 100 of 120/);
  click(t.window, t.q('.show-more'));
  await settle();
  assert.equal(t.ids().length, 120);
  assert.equal(t.q('.show-more'), null);
});

test('Show more moves focus to the first new card', async () => {
  const t = await setup({ posts: many(60) });
  click(t.window, t.q('.show-more'));
  await settle();
  const first = t.qa('.post-card')[50];
  assert.equal(t.focused.at(-1), first.querySelector('.post-actions a, .post-actions button'));
});

test('sort changes the order', async () => {
  const t = await setup({
    posts: [mk(1, { author: 'carl' }), mk(2, { author: 'alice' }), mk(3, { author: 'bob' })],
  });
  const select = t.q('select.saved-sort');
  assert.equal(select.getAttribute('aria-label'), 'Sort posts');
  assert.deepEqual(
    [...select.options].map((o) => o.textContent),
    ['Newest first', 'Oldest first', 'Author A to Z'],
  );
  choose(t.window, select, 'oldest');
  assert.deepEqual(t.ids(), ['p1', 'p2', 'p3']);
  choose(t.window, select, 'author');
  assert.deepEqual(t.ids(), ['p2', 'p3', 'p1']);
  choose(t.window, select, 'newest');
  assert.deepEqual(t.ids(), ['p3', 'p2', 'p1']);
});

test('folder chips show counts, orphans count as Uncategorised, and filter', async () => {
  const t = await setup({
    posts: [
      mk(1, { folder_id: 'f1' }),
      mk(2, { folder_id: null }),
      mk(3, { folder_id: 'gone' }),
      mk(4, { folder_id: 'f1' }),
    ],
  });
  assert.deepEqual([...t.qa('.filter-chips .chip')].map(textOf), [
    'All 4',
    'Uncategorised 2',
    'Code 0',
    'Reading 2',
  ]);
  click(t.window, t.chip('Uncategorised'));
  assert.deepEqual(t.ids(), ['p3', 'p2']);
  assert.equal(textOf(t.q('.saved-count')), '2 posts');
  click(t.window, t.chip('Reading'));
  assert.deepEqual(t.ids(), ['p4', 'p1']);
  assert.equal(t.chip('Reading').getAttribute('aria-pressed'), 'true');
});

test('tag chips show counts, filter, expand with Show all tags and clear', async () => {
  const posts = [
    mk(1, { tags: ['ai', 'rust'] }),
    mk(2, { tags: ['ai'] }),
    ...Array.from({ length: 14 }, (_, i) => mk(10 + i, { tags: [`t${i}`] })),
  ];
  const t = await setup({ posts });
  const tagChips = () => t.qa('.tag-cloud .chip');
  assert.equal(textOf(tagChips()[0]), '#ai 2');
  assert.equal(textOf(t.q('.tag-cloud .tag-label')), 'Tags:');
  assert.equal(tagChips().length, 10);
  const more = t.button(t.q('.tag-cloud'), 'Show all tags');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  click(t.window, more);
  assert.equal(tagChips().length, 16);
  assert.ok(t.button(t.q('.tag-cloud'), 'Show fewer tags'));
  click(t.window, tagChips()[0]);
  assert.deepEqual(t.ids(), ['p2', 'p1']);
  assert.equal(tagChips()[0].getAttribute('aria-pressed'), 'true');
  click(t.window, t.button(t.section.element, 'Clear filters'));
  assert.equal(t.ids().length, 16);
  assert.equal(t.button(t.section.element, 'Clear filters'), undefined);
});

test('clicking a tag on a card filters by it', async () => {
  const t = await setup({ posts: [mk(1, { tags: ['ai'] }), mk(2)] });
  click(t.window, t.q('.post-card .tag-link'));
  assert.deepEqual(t.ids(), ['p1']);
});

test('search is debounced 200 ms, filters in memory, and shows no results', async () => {
  const t = await setup({ posts: [mk(1, { text_preview: 'tokenizer' }), mk(2)] });
  const calls = t.client.calls.length;
  typeInto(t.window, t.q('input[type="search"]'), 'token');
  assert.equal(t.pending().ms, 200);
  assert.equal(t.ids().length, 2);
  await t.flush();
  assert.deepEqual(t.ids(), ['p1']);
  assert.equal(t.client.calls.length, calls, 'typing never refetches');
  typeInto(t.window, t.q('input[type="search"]'), 'zzzz');
  await t.flush();
  assert.match(textOf(t.section.element), /No matching posts/);
  assert.equal(textOf(t.q('.saved-count')), '0 posts');
  click(t.window, t.button(t.q('.empty-state'), 'Clear filters'));
  await settle();
  assert.equal(t.ids().length, 2);
  assert.equal(t.q('input[type="search"]').value, '');
});

test('a stale slow response never overwrites a newer one', async () => {
  const resolvers = [];
  let n = 0;
  const t = await setup({
    posts: many(1),
    routes: {
      [MSG.LIST_POSTS]: () => {
        n += 1;
        if (n === 1) return [mk(1)];
        return new Promise((resolve) => resolvers.push(resolve));
      },
    },
  });
  assert.deepEqual(t.ids(), ['p1']);
  t.window.document.dispatchEvent(new t.window.Event('visibilitychange'));
  t.window.dispatchEvent(new t.window.Event('focus'));
  await settle();
  assert.equal(resolvers.length, 2);
  resolvers[1]([mk(3)]); // newest request answers first
  await settle();
  resolvers[0]([mk(2)]); // older request answers late
  await settle();
  assert.deepEqual(t.ids(), ['p3']);
});

test('refreshes on focus and visibility, but not while hidden or when the page is hidden', async () => {
  const t = await setup({ posts: many(1) });
  const base = msgCount(t.client, MSG.LIST_POSTS);
  t.server.posts = [mk(1), mk(2)];
  t.window.dispatchEvent(new t.window.Event('focus'));
  await settle();
  assert.equal(msgCount(t.client, MSG.LIST_POSTS), base + 1);
  assert.deepEqual(t.ids(), ['p2', 'p1']);
  t.server.posts = [mk(1), mk(2), mk(3)];
  t.document.dispatchEvent(new t.window.Event('visibilitychange'));
  await settle();
  assert.deepEqual(t.ids(), ['p3', 'p2', 'p1']);
  const mid = msgCount(t.client, MSG.LIST_POSTS);
  Object.defineProperty(t.document, 'visibilityState', { value: 'hidden', configurable: true });
  t.document.dispatchEvent(new t.window.Event('visibilitychange'));
  await settle();
  assert.equal(msgCount(t.client, MSG.LIST_POSTS), mid);
  Object.defineProperty(t.document, 'visibilityState', { value: 'visible', configurable: true });
  t.section.element.hidden = true;
  t.window.dispatchEvent(new t.window.Event('focus'));
  await settle();
  assert.equal(msgCount(t.client, MSG.LIST_POSTS), mid, 'another section is showing');
});

test('refresh keeps filters, the sort and an open editor', async () => {
  const t = await setup({ posts: [mk(1, { tags: ['ai'] }), mk(2)] });
  click(t.window, t.q('.post-card .tag-link'));
  choose(t.window, t.q('select.saved-sort'), 'oldest');
  click(t.window, t.button(t.q('.post-card'), 'Edit'));
  await settle();
  t.window.dispatchEvent(new t.window.Event('focus'));
  await settle();
  assert.equal(t.qa('.post-editor').length, 1);
  assert.equal(t.q('select.saved-sort').value, 'oldest');
});

test('delete calls DELETE_POST, shows Undo, moves focus on, and Undo re-saves', async () => {
  const t = await setup({
    posts: [mk(1, { folder_id: 'f1', tags: ['ai'], notes: 'n' }), mk(2), mk(3)],
  });
  click(t.window, t.button(t.qa('.post-card')[1], 'Delete'));
  await settle();
  assert.deepEqual(t.client.calls.find((c) => c.type === MSG.DELETE_POST).payload, { id: 'p2' });
  assert.deepEqual(t.ids(), ['p3', 'p1']);
  assert.match(textOf(t.q('.snackbar')), /Post deleted/);
  assert.equal(t.focused.at(-1), t.qa('.post-card')[1].querySelector('.post-actions a'));
  t.server.posts.push(mk(2));
  click(t.window, t.button(t.q('.snackbar'), 'Undo'));
  await settle();
  const save = t.client.calls.find((c) => c.type === MSG.SAVE_POST);
  assert.deepEqual(save.payload, {
    url: 'https://x.com/user2/status/1002',
    folderId: null,
    tags: [],
    notes: '',
  });
  assert.equal(t.ids().length, 3);
});

test('deleting the only post focuses the search box', async () => {
  const t = await setup({ posts: many(1) });
  click(t.window, t.button(t.q('.post-card'), 'Delete'));
  await settle();
  assert.match(textOf(t.section.element), /Nothing saved yet/);
  assert.equal(t.focused.at(-1), t.q('input[type="search"]'));
});

test('edit sends tags and notes through UPDATE_POST, move sends folderId', async () => {
  const t = await setup({ posts: [mk(1, { tags: ['ai'], notes: 'old' })] });
  click(t.window, t.button(t.q('.post-card'), 'Edit'));
  await settle();
  const notes = t.q('.post-editor textarea');
  notes.value = 'new note';
  click(t.window, t.button(t.q('.post-editor'), 'Save'));
  await settle();
  const update = t.client.calls.find((c) => c.type === MSG.UPDATE_POST);
  assert.deepEqual(update.payload, { id: 'p1', patch: { tags: ['ai'], notes: 'new note' } });
  assert.equal(t.qa('.post-editor').length, 0);

  click(t.window, t.button(t.q('.post-card'), 'Move'));
  await settle();
  choose(t.window, t.q('.post-editor select'), 'f2');
  click(t.window, t.button(t.q('.post-editor'), 'Save'));
  await settle();
  const moves = t.client.calls.filter((c) => c.type === MSG.UPDATE_POST);
  assert.deepEqual(moves[1].payload, { id: 'p1', patch: { folderId: 'f2' } });
});

test('Escape cancels the editor and Open on X goes through openUrl', async () => {
  const t = await setup({ posts: many(1) });
  click(t.window, t.button(t.q('.post-card'), 'Edit'));
  await settle();
  press(t.window, t.q('.post-editor'), 'Escape');
  assert.equal(t.qa('.post-editor').length, 0);
  click(t.window, t.q('.open-link'));
  assert.deepEqual(t.opened, ['https://x.com/user1/status/1001']);
});

test('post fields are rendered as text, never markup', async () => {
  const evil = '<img src=x onerror=1>';
  const t = await setup({
    posts: [mk(1, { author: 'a', text_preview: evil, notes: evil, tags: ['x'] })],
    shown: true,
  });
  assert.equal(t.qa('img').length, 0);
  assert.match(textOf(t.q('.post-snippet')), /<img src=x onerror=1>/);
});

test('a failed load shows a retry state', async () => {
  let fail = true;
  const t = await setup({
    routes: {
      [MSG.LIST_POSTS]: () => {
        if (fail) throw new Error('boom');
        return many(2);
      },
    },
  });
  assert.match(textOf(t.section.element), /Could not load your posts/);
  fail = false;
  click(t.window, t.button(t.q('.empty-state'), 'Retry'));
  await settle();
  assert.equal(t.ids().length, 2);
});

test('keyboard: filter chips and sort are native controls reachable by tab', async () => {
  const t = await setup({ posts: many(2) });
  for (const node of t.qa('.filter-chips .chip, select.saved-sort, .post-actions button')) {
    assert.notEqual(node.getAttribute('tabindex'), '-1');
  }
  assert.equal(
    fire(t.window, t.q('input[type="search"]'), 'keydown', { key: 'a' }).defaultPrevented,
    false,
  );
});

test('no count is shown until the library has loaded', async () => {
  let release;
  const t = await setup({
    routes: { [MSG.LIST_POSTS]: () => new Promise((resolve) => (release = resolve)) },
  });
  assert.equal(textOf(t.q('.saved-count')), '');
  release(many(2));
  await settle();
  assert.equal(textOf(t.q('.saved-count')), '2 posts');
});
