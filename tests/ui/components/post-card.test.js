import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom, click, textOf } from '../../../test-support/dom.js';
import { createPostCard } from '../../../src/ui/components/post-card.js';

const now = new Date('2025-11-21T12:00:00.000Z');
const XSS = '<img src=x onerror=alert(1)>';
const folders = [{ id: 'f1', name: 'Reading', updated_at: '', deleted: false }];
const basePost = (over = {}) => ({
  id: 'p1',
  url: 'https://x.com/ada_builds/status/123456789',
  author: 'ada_builds',
  text_preview: 'a snippet',
  folder_id: 'f1',
  tags: ['ai', 'ml'],
  notes: '',
  created_at: '2025-11-21T11:00:00.000Z',
  updated_at: '',
  deleted: false,
  ...over,
});

function setup(post, handlers = {}) {
  const ctx = makeDom();
  const calls = [];
  const card = createPostCard(ctx.dom, {
    post,
    now,
    folders,
    onOpen: (u) => calls.push(['open', u]),
    onEdit: (p) => calls.push(['edit', p.id]),
    onMove: (p) => calls.push(['move', p.id]),
    onDelete: (p) => calls.push(['delete', p.id]),
    onTag: (t) => calls.push(['tag', t]),
    ...handlers,
  });
  ctx.document.body.append(card);
  return { ...ctx, card, calls };
}

test('renders author, snippet, url, tags, folder and age', () => {
  const { card } = setup(basePost());
  const text = textOf(card);
  for (const part of [
    '@ada_builds',
    'a snippet',
    'x.com/ada_builds/status/123456789',
    '#ai',
    '#ml',
    'Reading',
    '1h',
  ])
    assert.ok(text.includes(part), part);
});

test('exposes visible Open on X, Edit, Move and Delete controls with callbacks', () => {
  const { window, card, calls } = setup(basePost());
  const byText = (t) => [...card.querySelectorAll('a,button')].find((n) => textOf(n).includes(t));
  const open = byText('Open on X');
  assert.equal(open.getAttribute('href'), 'https://x.com/ada_builds/status/123456789');
  assert.equal(open.getAttribute('rel'), 'noopener noreferrer');
  const e = click(window, open);
  assert.equal(e.defaultPrevented, true);
  click(window, byText('Edit'));
  click(window, byText('Move'));
  click(window, byText('Delete'));
  click(window, byText('#ml'));
  assert.deepEqual(calls, [
    ['open', 'https://x.com/ada_builds/status/123456789'],
    ['edit', 'p1'],
    ['move', 'p1'],
    ['delete', 'p1'],
    ['tag', 'ml'],
  ]);
});

test('never interprets HTML in author, snippet, notes, tags, folder or url', () => {
  const post = basePost({
    author: XSS,
    text_preview: XSS,
    notes: XSS,
    tags: [XSS],
    url: `https://x.com/a/status/1?${XSS}`,
  });
  const { card } = setup(post, {});
  assert.equal(card.querySelector('img'), null);
  assert.ok(textOf(card).includes(XSS));
});

test('no Open link for urls that are not X posts', () => {
  const { card } = setup(basePost({ url: 'javascript:alert(1)' }));
  assert.equal(card.querySelector('a'), null);
});

test('null author shows Post and falls back to notes for the snippet', () => {
  const { card } = setup(basePost({ author: null, text_preview: '', notes: 'my notes' }));
  assert.ok(textOf(card).includes('Post'));
  assert.ok(textOf(card).includes('my notes'));
});

test('Open passes the canonical https url, not the raw stored string', () => {
  const { window, card, calls } = setup(
    basePost({ url: 'http://twitter.com/ada_builds/status/5?s=20' }),
  );
  const a = card.querySelector('a');
  assert.equal(a.getAttribute('href'), 'https://x.com/ada_builds/status/5');
  click(window, a);
  assert.deepEqual(calls, [['open', 'https://x.com/ada_builds/status/5']]);
});
