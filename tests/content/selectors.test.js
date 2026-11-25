import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, resetContent, ARTICLE, QUOTE, BAR } from '../../test-support/content.js';

afterEach(resetContent);

const load = async (html) => {
  const ctx = await loadContent(['selectors.js'], html);
  return { ...ctx, article: ctx.document.querySelector('article') };
};

test('constants are frozen and exposed on the shared namespace', async () => {
  const { xmark } = await load('');
  assert.ok(Object.isFrozen(xmark.selectors));
  assert.equal(xmark.selectors.article, 'article[data-testid="tweet"]');
});

test('finds action bar, status link and text node', async () => {
  const { xmark, article } = await load(ARTICLE('42'));
  const bar = xmark.selectors.findActionBar(article);
  assert.equal(bar.getAttribute('role'), 'group');
  assert.ok(bar.querySelector('[data-testid="like"]'));
  assert.equal(xmark.selectors.findStatusLink(article).getAttribute('href'), '/alice/status/42');
  assert.equal(xmark.selectors.findTextNode(article).textContent, 'hello world');
});

test('action bar also matches an already-liked post (unlike)', async () => {
  const { xmark, article } = await load(ARTICLE('1', { like: 'unlike' }));
  assert.ok(xmark.selectors.findActionBar(article));
});

test('picks the last group containing like, ignoring unrelated groups', async () => {
  const html = `<article data-testid="tweet">
    <div role="group" id="media"><button data-testid="reply"></button></div>
    <div role="group" id="bar"><button data-testid="like"></button></div>
  </article>`;
  const { xmark, article } = await load(html);
  assert.equal(xmark.selectors.findActionBar(article).id, 'bar');
});

test('broken or missing markup yields null and never throws', async () => {
  const { xmark, article } = await load(
    '<article data-testid="tweet"><div role="group"></div><a href="/x/status/1">no time</a></article>',
  );
  const s = xmark.selectors;
  assert.equal(s.findActionBar(article), null);
  assert.equal(s.findStatusLink(article), null);
  assert.equal(s.findTextNode(article), null);
  for (const bad of [null, undefined, {}, 5, 'x', { querySelectorAll: () => 1 }]) {
    assert.equal(s.findActionBar(bad), null);
    assert.equal(s.findStatusLink(bad), null);
    assert.equal(s.findTextNode(bad), null);
  }
});

test('a time link that is not a status link is ignored', async () => {
  const { xmark, article } = await load(
    '<article data-testid="tweet"><a href="/alice"><time>1</time></a></article>',
  );
  assert.equal(xmark.selectors.findStatusLink(article), null);
});

const MAIN_TIME = '<a href="/alice/status/10"><time>1h</time></a>';
const MAIN_TEXT = '<div data-testid="tweetText"><span>main text</span></div>';
const art = (inner) => `<article data-testid="tweet">${inner}</article>`;

test('quote tweet on the timeline: main link and text win over the quote card', async () => {
  const { xmark, article } = await load(art(MAIN_TIME + MAIN_TEXT + QUOTE('900') + BAR));
  assert.equal(xmark.selectors.findStatusLink(article).getAttribute('href'), '/alice/status/10');
  assert.equal(xmark.selectors.findTextNode(article).textContent, 'main text');
});

test('detail page: quote card before the main timestamp is ignored', async () => {
  const { xmark, article } = await load(art(MAIN_TEXT + QUOTE('900') + MAIN_TIME + BAR));
  assert.equal(xmark.selectors.findStatusLink(article).getAttribute('href'), '/alice/status/10');
});

test('media-only post quoting another: no text node, quoted text never returned', async () => {
  const { xmark, article } = await load(art(MAIN_TIME + QUOTE('900', { text: 'theirs' }) + BAR));
  assert.equal(xmark.selectors.findTextNode(article), null);
  assert.equal(xmark.selectors.findStatusLink(article).getAttribute('href'), '/alice/status/10');
});

test('only a quoted link exists: save nothing rather than the wrong post', async () => {
  const { xmark, article } = await load(art(MAIN_TEXT + QUOTE('900') + BAR));
  assert.equal(xmark.selectors.findStatusLink(article), null);
});

test('nested articles do not leak into the outer one', async () => {
  const inner =
    '<article data-testid="tweet"><a href="/bob/status/5"><time>1</time></a><div data-testid="tweetText">inner</div></article>';
  const { xmark, document } = await load(art(inner + BAR));
  const outer = document.querySelector('article');
  assert.equal(xmark.selectors.findStatusLink(outer), null);
  assert.equal(xmark.selectors.findTextNode(outer), null);
});

test('an anchor above the article is never used', async () => {
  const { xmark, article } = await load(
    '<a href="/eve/status/7"><article data-testid="tweet"><time>1</time></article></a>',
  );
  assert.equal(xmark.selectors.findStatusLink(article), null);
});

test('the unused author selector is gone', async () => {
  const { xmark } = await load('');
  assert.equal(xmark.selectors.author, undefined);
});
