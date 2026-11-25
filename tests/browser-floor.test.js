import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME_MIN_VERSION, SAFARI_MIN_VERSION } from '../scripts/manifest-transform.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const manifest = JSON.parse(await readFile(join(SRC, 'manifest.json'), 'utf8'));

// First version supporting each feature, from MDN browser-compat-data (v8.1.10). `pattern` finds it
// in shipped code (src/, comments stripped). Features without a pattern are manifest keys / extension
// APIs listed so the declared floor is the maximum over EVERYTHING the extension needs.
const FEATURES = [
  {
    name: 'structuredClone',
    pattern: /\bstructuredClone\s*\(/,
    chrome: 98,
    firefox: 94,
    safari: 15.4,
  },
  {
    name: 'Object.hasOwn',
    pattern: /\bObject\.hasOwn\s*\(/,
    chrome: 93,
    firefox: 92,
    safari: 15.4,
  },
  { name: 'Array.prototype.at', pattern: /\.at\(\s*-?\d/, chrome: 92, firefox: 90, safari: 15.4 },
  {
    name: 'crypto.randomUUID',
    pattern: /\.randomUUID\s*\(/,
    chrome: 92,
    firefox: 95,
    safari: 15.4,
  },
  {
    name: 'String.prototype.replaceAll',
    pattern: /\.replaceAll\s*\(/,
    chrome: 85,
    firefox: 77,
    safari: 13.1,
  },
  {
    name: 'Array findLast/findLastIndex',
    pattern: /\.findLast(Index)?\s*\(/,
    chrome: 97,
    firefox: 104,
    safari: 15.4,
  },
  {
    name: 'Array toSorted/toReversed/toSpliced/with',
    pattern: /\.(toSorted|toReversed|toSpliced)\s*\(/,
    chrome: 110,
    firefox: 115,
    safari: 16,
  },
  {
    name: 'Object.groupBy',
    pattern: /\bObject\.groupBy\s*\(/,
    chrome: 117,
    firefox: 119,
    safari: 17.4,
  },
  {
    name: 'Set methods (union etc.)',
    pattern: /\.(union|intersection|difference|isSubsetOf)\s*\(/,
    chrome: 122,
    firefox: 127,
    safari: 17,
  },
  {
    name: 'AbortSignal.timeout',
    pattern: /AbortSignal\.timeout/,
    chrome: 124,
    firefox: 100,
    safari: 16,
  },
  {
    name: 'Error cause',
    pattern: /new \w*Error\([^)]*\{\s*cause/,
    chrome: 93,
    firefox: 91,
    safari: 15,
  },
  {
    name: 'logical assignment (??= ||= &&=)',
    pattern: /(\?\?|\|\||&&)=/,
    chrome: 85,
    firefox: 79,
    safari: 14,
  },
  {
    name: 'class private/static members',
    pattern: /^\s*(static\s*\{|#\w+\s*[=;(]|static\s+#)/m,
    chrome: 94,
    firefox: 93,
    safari: 16.4,
  },
  { name: 'top-level await', pattern: /^await\b/m, chrome: 89, firefox: 89, safari: 15 },
  {
    name: 'optional chaining / nullish',
    pattern: /\?\.\w|\?\?/,
    chrome: 80,
    firefox: 74,
    safari: 13.1,
  },
  {
    name: 'Object.fromEntries',
    pattern: /Object\.fromEntries/,
    chrome: 73,
    firefox: 63,
    safari: 12.1,
  },
  { name: 'CSS :focus-visible', pattern: /:focus-visible/, chrome: 86, firefox: 85, safari: 15.4 },
  { name: 'CSS :has()', pattern: /:has\(/, chrome: 105, firefox: 121, safari: 15.4 },
  { name: 'CSS nesting', pattern: /^\s*&[\s.:]/m, chrome: 120, firefox: 117, safari: 17.2 },
  { name: 'CSS color-mix', pattern: /color-mix\(/, chrome: 111, firefox: 113, safari: 16.2 },
  { name: 'CSS @container', pattern: /@container/, chrome: 105, firefox: 110, safari: 16 },
  {
    name: 'HTML inert attribute',
    pattern: /\.inert\b|\binert=/,
    chrome: 102,
    firefox: 112,
    safari: 15.5,
  },
  // Manifest keys and extension APIs (no code pattern).
  { name: 'manifest background.type module', chrome: 92, firefox: 112, safari: 16.4 },
  {
    name: 'manifest action / host_permissions / service_worker',
    chrome: 88,
    firefox: 109,
    safari: 15.4,
  },
  { name: 'manifest incognito not_allowed', chrome: 47 },
  { name: 'manifest options_ui', chrome: 40 },
];

// Progressive enhancement that degrades to a working fallback; excluded from the floor on purpose.
const PROGRESSIVE = [
  {
    name: 'CSS scrollbar-width/-color',
    pattern: /scrollbar-(width|color)/,
    chrome: 121,
    fallback: '::-webkit-scrollbar',
  },
];

const stripComments = (code) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(js|css|html)$/.test(path)) yield path;
  }
}

/** Features whose pattern is used anywhere in `files` ([{path, text}]). */
export function usedFeatures(files, features = FEATURES) {
  return features.filter((f) => f.pattern && files.some((file) => f.pattern.test(file.text)));
}

const shipped = [];
for await (const path of walk(SRC)) {
  shipped.push({ path, text: stripComments(await readFile(path, 'utf8')) });
}

test('scanner finds the features it lists (fixtures)', () => {
  const fx = (text) => usedFeatures([{ text }]).map((f) => f.name);
  assert.deepEqual(fx('const a = structuredClone(x);'), ['structuredClone']);
  assert.deepEqual(fx('if (Object.hasOwn(o, k)) {}'), ['Object.hasOwn']);
  assert.deepEqual(fx('xs.at(-1)'), ['Array.prototype.at']);
  assert.ok(fx('x ??= 1').includes('logical assignment (??= ||= &&=)'));
  assert.deepEqual(fx('.a:has(.b) {}'), ['CSS :has()']);
  assert.deepEqual(fx('const a = 1;'), []);
});

test('the declared Chrome floor is exactly the maximum over the table and the features used in src', () => {
  const used = usedFeatures(shipped);
  const staticOnes = FEATURES.filter((f) => !f.pattern);
  const needed = Math.max(...[...used, ...staticOnes].map((f) => f.chrome));
  assert.equal(Number(CHROME_MIN_VERSION), needed, `floor must be ${needed}`);
  // The shipped code uses at least the features that set the current floor.
  assert.ok(used.some((f) => f.name === 'structuredClone'));
});

test('no used built-in or syntax needs a newer Chrome than the declared floor', () => {
  for (const f of usedFeatures(shipped)) {
    assert.ok(f.chrome <= Number(CHROME_MIN_VERSION), `${f.name} needs Chrome ${f.chrome}`);
  }
});

test('Firefox 140 and Safari 18 comfortably cover everything used', () => {
  const firefox = Number(manifest.browser_specific_settings.gecko.strict_min_version);
  for (const f of [...usedFeatures(shipped), ...FEATURES.filter((x) => !x.pattern)]) {
    if (f.firefox !== undefined)
      assert.ok(f.firefox <= firefox, `${f.name} needs Firefox ${f.firefox}`);
    if (f.safari !== undefined)
      assert.ok(f.safari <= parseFloat(SAFARI_MIN_VERSION), `${f.name} needs Safari ${f.safari}`);
  }
});

test('progressive CSS above the floor always ships with a fallback and is the only exception', () => {
  for (const p of PROGRESSIVE) {
    const hits = shipped.filter((f) => p.pattern.test(f.text));
    for (const hit of hits)
      assert.ok(hit.text.includes(p.fallback), `${p.name} fallback in ${hit.path}`);
  }
});
