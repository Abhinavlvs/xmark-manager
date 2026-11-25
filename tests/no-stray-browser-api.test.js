import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripJs } from '../test-support/strip-js.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
// The only files allowed to name the `browser` / `chrome` globals.
const ALLOWED = new Set(['platform/browser-api.js', 'content/messages.js']);

const ROOTS = '(?:globalThis|window|self|top|parent|frames)';

/**
 * Token-level rule on code with comments and strings removed: any bare `browser` / `chrome`
 * identifier is a use of the global, unless it follows `.` (a property of something else) or is an
 * object-literal key (`{ browser: 1 }`, `, chrome: 2`). `globalThis.browser` style access (which
 * follows `.`) is caught by its own rule, and so is destructuring from a global root.
 * Returns the offending snippets.
 */
export function strayUses(source) {
  const code = stripJs(source);
  const hits = [];
  for (const m of code.matchAll(/\b(browser|chrome)\b/g)) {
    const before = code.slice(0, m.index).trimEnd().slice(-1);
    const after = code.slice(m.index + m[0].length).trimStart()[0];
    if (before === '.') continue;
    if ((before === '{' || before === ',') && after === ':') continue; // object key
    hits.push(code.slice(Math.max(0, m.index - 20), m.index + 25).replace(/\s+/g, ' '));
  }
  const root = new RegExp(`\\b${ROOTS}\\s*\\??\\.\\s*(?:browser|chrome)\\b`, 'g');
  for (const m of code.matchAll(root)) hits.push(m[0]);
  const destructure = new RegExp(
    `\\{[^}]*\\b(?:browser|chrome)\\b[^}]*\\}\\s*=\\s*${ROOTS}\\b`,
    'g',
  );
  for (const m of code.matchAll(destructure)) hits.push(m[0].replace(/\s+/g, ' '));
  return hits;
}

/** JavaScript to scan in a file: the file itself, or the inline <script> bodies of an HTML page. */
function scriptsOf(path, text) {
  if (!path.endsWith('.html')) return [text];
  return [...text.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1],
  );
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|cjs|html)$/.test(path)) yield path;
  }
}

test('the detector catches every way of reaching the globals', () => {
  for (const bad of [
    'browser.runtime.id',
    'chrome.storage.local',
    'browser?.runtime',
    "chrome['runtime']",
    "chrome?.['runtime']",
    'browser\n  .runtime.id',
    'return chrome;',
    'const x = chrome ?? y;',
    'f([browser])',
    'export default browser;',
    'globalThis.browser',
    'globalThis?.chrome',
    "globalThis['chrome']",
    'window["browser"]',
    'self\n.chrome',
    'const { browser } = globalThis;',
    'const {\n  chrome: c,\n  x,\n} = self;',
    'typeof chrome',
    'use(browser);',
    'f(a, chrome)',
    'const s = `${chrome.runtime.id}`;',
    'const s = `a ${ `b ${browser.x}` }`;',
  ]) {
    assert.ok(strayUses(bad).length > 0, bad);
  }
});

test('the detector ignores comments, strings, keys, properties and look-alikes', () => {
  for (const ok of [
    '// browser.runtime',
    '/* chrome.storage */',
    "const s = 'this browser. It is';",
    'const s = `plain chrome text`;',
    'const browserApi = getBrowserApi();',
    'browserApi.runtime.id',
    'const chromeLike = 1;',
    'const o = { browser: 1, chrome: 2 };',
    'x.chrome.y',
    "const re = /'chrome'/; const t = 1;",
  ]) {
    assert.deepEqual(strayUses(ok), [], ok);
  }
});

test('no direct browser / chrome global use in src (js, mjs, html scripts) outside the adapters', async () => {
  const offenders = [];
  for await (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    if (ALLOWED.has(rel)) continue;
    for (const script of scriptsOf(file, await readFile(file, 'utf8'))) {
      for (const hit of strayUses(script)) offenders.push(`${rel}: ${hit}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the allow-listed files really do name the globals', async () => {
  for (const rel of ALLOWED) {
    const code = stripJs(await readFile(join(SRC, rel), 'utf8'));
    assert.match(code, /\b(browser|chrome)\b/, rel);
  }
});
