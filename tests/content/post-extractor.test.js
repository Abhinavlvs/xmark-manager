import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, resetContent, ARTICLE } from '../../test-support/content.js';

afterEach(resetContent);

const load = async (html) => {
  const ctx = await loadContent(['selectors.js', 'post-extractor.js'], html);
  return { ...ctx, article: ctx.document.querySelector('article') };
};

test('resolves url and takes author from the URL path', async () => {
  const { xmark, article } = await load(ARTICLE('123', { user: 'bob_1' }));
  assert.deepEqual(xmark.extractPost(article, { includeText: false }), {
    url: 'https://x.com/bob_1/status/123',
    author: 'bob_1',
    textPreview: '',
  });
});

test('text only when includeText, collapsed and trimmed', async () => {
  const { xmark, article } = await load(ARTICLE('1', { text: '  hello \n\n   world  ' }));
  assert.equal(xmark.extractPost(article, { includeText: true }).textPreview, 'hello world');
  assert.equal(xmark.extractPost(article, {}).textPreview, '');
  assert.equal(xmark.extractPost(article).textPreview, '');
});

test('cuts at 280 UTF-16 units without splitting a surrogate pair', async () => {
  const text = 'a'.repeat(279) + '\u{1F600}tail';
  const { xmark, article } = await load(ARTICLE('1', { text }));
  const out = xmark.extractPost(article, { includeText: true }).textPreview;
  assert.equal(out, 'a'.repeat(279));
  const exact = 'b'.repeat(280) + 'zzz';
  const { xmark: x2, article: a2 } = await load(ARTICLE('1', { text: exact }));
  assert.equal(x2.extractPost(a2, { includeText: true }).textPreview.length, 280);
  const { xmark: x3, article: a3 } = await load(
    ARTICLE('1', { text: 'a'.repeat(278) + '\u{1F600}x' }),
  );
  assert.equal(x3.extractPost(a3, { includeText: true }).textPreview.length, 280);
});

test('html-looking text stays text', async () => {
  const html = ARTICLE('1').replace(
    '<span>hello world</span>',
    '<span>&lt;img src=x onerror=alert(1)&gt;</span>',
  );
  const { xmark, article } = await load(html);
  assert.equal(
    xmark.extractPost(article, { includeText: true }).textPreview,
    '<img src=x onerror=alert(1)>',
  );
});

test('returns null for missing, non-status or foreign links', async () => {
  for (const href of [
    '/alice',
    '/i/web/status/5',
    'https://evil.com/a/status/1',
    '/a/status/abc',
  ]) {
    const { xmark, article } = await load(
      `<article data-testid="tweet"><a href="${href}"><time>1</time></a></article>`,
    );
    assert.equal(xmark.extractPost(article, { includeText: true }), null, href);
  }
  const { xmark } = await load('');
  assert.equal(xmark.extractPost(null, {}), null);
  assert.equal(xmark.extractPost({}, {}), null);
});

test('accepts an absolute twitter.com link and trims trailing path', async () => {
  const { xmark, article } = await load(
    '<article data-testid="tweet"><a href="https://twitter.com/carol/status/9/photo/1?x=1"><time>1</time></a></article>',
  );
  assert.equal(xmark.extractPost(article, {}).url, 'https://twitter.com/carol/status/9');
});

test('media-only post quoting another: url is the main post, text is empty', async () => {
  const html =
    '<article data-testid="tweet"><a href="/alice/status/10"><time>1</time></a>' +
    '<div role="link" tabindex="0"><a href="/q/status/9"><time>2</time></a><div data-testid="tweetText">theirs</div></div>' +
    '<div role="group"><button data-testid="like"></button></div></article>';
  const { xmark, article } = await load(html);
  assert.deepEqual(xmark.extractPost(article, { includeText: true }), {
    url: 'https://x.com/alice/status/10',
    author: 'alice',
    textPreview: '',
  });
});

test('maxLength cuts the text at the chosen length', async () => {
  const text = 'w'.repeat(100);
  const { xmark, article } = await load(ARTICLE('1', { text }));
  for (const n of [35, 40, 99, 100, 101, 280]) {
    const out = xmark.extractPost(article, { includeText: true, maxLength: n }).textPreview;
    assert.equal(out.length, Math.min(n, 100), String(n));
  }
});

test('maxLength never splits an emoji straddling the boundary', async () => {
  const text = 'a'.repeat(39) + '\u{1F600}' + 'tail tail tail';
  const { xmark, article } = await load(ARTICLE('1', { text }));
  const at = (n) => xmark.extractPost(article, { includeText: true, maxLength: n }).textPreview;
  assert.equal(at(40), 'a'.repeat(39));
  assert.equal(at(41), 'a'.repeat(39) + '\u{1F600}');
  assert.equal(at(39), 'a'.repeat(39));
});

test('a bad maxLength falls back to 280 and a larger one is capped at 280', async () => {
  const { xmark, article } = await load(ARTICLE('1', { text: 'q'.repeat(400) }));
  for (const bad of [undefined, null, '40', NaN, 0, -3, 1000, 1.5]) {
    const out = xmark.extractPost(article, { includeText: true, maxLength: bad }).textPreview;
    assert.equal(out.length, 280, String(bad));
  }
});

test('maxLength does nothing without includeText', async () => {
  const { xmark, article } = await load(ARTICLE('1', { text: 'hello world' }));
  assert.equal(xmark.extractPost(article, { maxLength: 35 }).textPreview, '');
});
