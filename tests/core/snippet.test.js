import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNIPPET_MIN,
  SNIPPET_MAX,
  SNIPPET_DEFAULT,
  coerceSnippetLength,
  cutSnippet,
} from '../../src/core/snippet.js';
import { MAX_PREVIEW } from '../../src/core/model.js';

test('the limits are 35, 280 and 280 and the maximum equals the stored cap', () => {
  assert.deepEqual([SNIPPET_MIN, SNIPPET_MAX, SNIPPET_DEFAULT], [35, 280, 280]);
  assert.equal(SNIPPET_MAX, MAX_PREVIEW);
});

test('coerceSnippetLength: validation table', () => {
  const table = [
    [35, 35],
    [36, 36],
    [140, 140],
    [280, 280],
    [281, 280],
    [34, 35],
    [0, 35],
    [-1, 35],
    [140.6, 141],
    [140.4, 140],
    ['200', 280],
    [null, 280],
    [undefined, 280],
    [NaN, 280],
    [Infinity, 280],
    [-Infinity, 35],
    [{}, 280],
    [true, 280],
  ];
  for (const [input, expected] of table) {
    assert.equal(coerceSnippetLength(input), expected, String(input));
  }
});

test('cutSnippet cuts to the length and never splits a surrogate pair', () => {
  assert.equal(cutSnippet('abcdef', 3), 'abc');
  assert.equal(cutSnippet('abc', 10), 'abc');
  const emoji = 'a'.repeat(39) + '\u{1F600}tail';
  assert.equal(cutSnippet(emoji, 40), 'a'.repeat(39));
  assert.equal(cutSnippet(emoji, 41), 'a'.repeat(39) + '\u{1F600}');
  assert.equal(cutSnippet('', 5), '');
});
