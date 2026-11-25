import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadContent, resetContent } from '../../test-support/content.js';
import {
  SNIPPET_MIN,
  SNIPPET_MAX,
  SNIPPET_DEFAULT,
  coerceSnippetLength,
} from '../../src/core/snippet.js';
import { MAX_PREVIEW } from '../../src/core/model.js';

afterEach(resetContent);

test('the content-script snippet limits equal the shared limits (drift test)', async () => {
  const { xmark } = await loadContent(['selectors.js', 'dom-util.js', 'panel-form.js']);
  const f = xmark.panelForm;
  assert.equal(f.SNIPPET_MIN, SNIPPET_MIN);
  assert.equal(f.SNIPPET_MAX, SNIPPET_MAX);
  assert.equal(f.SNIPPET_DEFAULT, SNIPPET_DEFAULT);
  assert.equal(SNIPPET_MAX, MAX_PREVIEW);
});

test('the content-script clamp agrees with the shared coerceSnippetLength', async () => {
  const { xmark } = await loadContent(['selectors.js', 'dom-util.js', 'panel-form.js']);
  for (const v of [
    35,
    36,
    140,
    280,
    281,
    34,
    0,
    -1,
    140.6,
    140.4,
    '200',
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    {},
    true,
  ]) {
    assert.equal(xmark.panelForm.snippetLength(v), coerceSnippetLength(v), String(v));
  }
});

test('the extractor cap equals the shared maximum', async () => {
  const src = await readFile(
    new URL('../../src/content/post-extractor.js', import.meta.url),
    'utf8',
  );
  const cap = /const MAX_PREVIEW = (\d+);/.exec(src);
  assert.equal(Number(cap?.[1]), SNIPPET_MAX);
});
