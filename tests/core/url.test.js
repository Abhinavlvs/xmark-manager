import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostUrl } from '../../src/core/url.js';

test('twitter.com status url is canonicalized to x.com', () => {
  assert.deepEqual(parsePostUrl('https://twitter.com/ada_builds/status/123?s=20'), {
    id: '123',
    author: 'ada_builds',
    url: 'https://x.com/ada_builds/status/123',
  });
});

test('/i/web/status form has null author and strips suffix', () => {
  assert.deepEqual(parsePostUrl('https://x.com/i/web/status/123/photo/1'), {
    id: '123',
    author: null,
    url: 'https://x.com/i/web/status/123',
  });
});

test('rejects non-post urls and garbage', () => {
  for (const input of [
    'https://x.com/home',
    'https://example.com/a/status/1',
    'javascript:alert(1)',
    '',
    'not a url',
  ]) {
    assert.equal(parsePostUrl(input), null, input);
  }
});

test('accepts allowed hosts, case-insensitive', () => {
  for (const host of [
    'x.com',
    'twitter.com',
    'www.x.com',
    'www.twitter.com',
    'mobile.twitter.com',
    'X.COM',
    'Www.Twitter.Com',
  ]) {
    const r = parsePostUrl(`https://${host}/jack/status/20`);
    assert.equal(r?.url, 'https://x.com/jack/status/20', host);
  }
  assert.equal(parsePostUrl('http://x.com/jack/status/20')?.id, '20');
});

test('rejects lookalike hosts', () => {
  for (const host of [
    'x.com.evil.com',
    'notx.com',
    'evil.com',
    'xx.com',
    'm.x.com.evil.io',
    'x.com@evil.com',
  ]) {
    assert.equal(parsePostUrl(`https://${host}/jack/status/20`), null, host);
  }
});

test('rejects non-http protocols', () => {
  for (const p of ['ftp', 'file', 'data', 'ws', 'javascript']) {
    assert.equal(parsePostUrl(`${p}://x.com/jack/status/20`), null, p);
  }
});

test('requires an all-digit status id', () => {
  for (const id of ['abc', '12a', '1.5', '-1', '', '12%20']) {
    assert.equal(parsePostUrl(`https://x.com/jack/status/${id}`), null, id);
  }
});

test('never throws and returns null for non-string input', () => {
  for (const input of [null, undefined, 123, {}, [], true, Symbol('s'), () => {}]) {
    assert.equal(parsePostUrl(input), null);
  }
});

test('strips query, hash, trailing slash and suffixes', () => {
  const expected = { id: '99', author: 'jack', url: 'https://x.com/jack/status/99' };
  for (const path of [
    '/jack/status/99/',
    '/jack/status/99#frag',
    '/jack/status/99?a=1#frag',
    '/jack/status/99/photo/1',
    '/jack/status/99/video/1',
    '/jack/status/99/analytics',
    '/jack/status/99/likes',
  ]) {
    assert.deepEqual(parsePostUrl(`https://x.com${path}`), expected, path);
  }
});

test('preserves handle casing', () => {
  assert.equal(parsePostUrl('https://x.com/Ada_Builds/status/5')?.author, 'Ada_Builds');
  assert.equal(
    parsePostUrl('https://x.com/Ada_Builds/status/5')?.url,
    'https://x.com/Ada_Builds/status/5',
  );
});

test('reserved first segments never yield an author', () => {
  for (const seg of [
    'home',
    'explore',
    'search',
    'settings',
    'messages',
    'notifications',
    'i',
    'compose',
    'intent',
  ]) {
    assert.equal(parsePostUrl(`https://x.com/${seg}/status/1`), null, seg);
  }
  assert.equal(parsePostUrl('https://x.com/i/status/1'), null);
});

test('rejects invalid handles and missing status segment', () => {
  for (const path of [
    '/jack',
    '/jack/likes/5',
    '/ja ck/status/1',
    '/toolonghandle_toolong/status/1',
    '/ja-ck/status/1',
    '/status/1',
    '/',
  ]) {
    assert.equal(parsePostUrl(`https://x.com${path}`), null, path);
  }
});

test('i/web/status is matched case-insensitively', () => {
  assert.deepEqual(parsePostUrl('https://x.com/I/Web/status/1'), {
    id: '1',
    author: null,
    url: 'https://x.com/i/web/status/1',
  });
});

test('status id is bounded to 1-20 digits', () => {
  const id20 = '1'.repeat(20);
  assert.equal(parsePostUrl(`https://x.com/a/status/${id20}`)?.id, id20);
  assert.equal(parsePostUrl(`https://x.com/a/status/${'1'.repeat(21)}`), null);
  assert.equal(parsePostUrl(`https://x.com/i/web/status/${'1'.repeat(21)}`), null);
});

test('port is dropped from the canonical url', () => {
  assert.equal(parsePostUrl('https://x.com:8080/a/status/1')?.url, 'https://x.com/a/status/1');
});

test('surrounding whitespace is trimmed', () => {
  assert.equal(parsePostUrl('  https://x.com/a/status/1\n')?.url, 'https://x.com/a/status/1');
});
