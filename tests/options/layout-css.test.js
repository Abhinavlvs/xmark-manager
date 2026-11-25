import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../src/options/options.css', import.meta.url), 'utf8');

/** The declarations of the first top-level rule for `selector` (outside media queries). */
function rule(selector) {
  const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
  const match = top.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `rule ${selector} exists`);
  return match[1];
}

test('the shell is not a centred, width-capped wrapper', () => {
  const shell = rule('.shell');
  assert.doesNotMatch(shell, /max-width/);
  assert.doesNotMatch(shell, /margin:\s*0\s+auto/);
});

test('the nav is docked to the left edge and divides the content with a thin line', () => {
  const nav = rule('.nav');
  assert.match(nav, /position:\s*sticky/);
  assert.match(nav, /border-right:\s*1px solid/);
});

test('the content is fluid; only non-wide sections get a readable max width', () => {
  assert.doesNotMatch(rule('.content'), /max-width/);
  assert.match(css, /\.section:not\(\.section-wide\)\s*\{[^}]*max-width:\s*900px/);
});
