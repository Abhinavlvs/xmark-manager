import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRIVACY_FACTS, SNIPPET_EXPLAINER } from '../src/options/privacy-copy.js';
import { SNIPPET_MIN, SNIPPET_MAX, SNIPPET_DEFAULT } from '../src/core/snippet.js';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const NEW = `${SNIPPET_MIN} to ${SNIPPET_MAX} characters`;
const FILES = [
  'PRIVACY.md',
  'README.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'docs/PRIVACY_POLICY_TEXT.md',
  'docs/AMO_SUBMISSION.md',
  'docs/STORE_LISTING_CHROME.md',
  'docs/STORE_LISTING_SAFARI.md',
  'docs/MANUAL_QA.md',
  'src/options/privacy-copy.js',
];

test('no copy still claims a fixed 280 character snippet', async () => {
  const old = /(first|max|up to|maximum of|at most) 280 characters|280 characters (max|maximum)/i;
  for (const file of FILES) {
    const text = (await read(file)).replace(/\s+/g, ' ');
    assert.doesNotMatch(text, old, `${file} still says a fixed 280`);
  }
});

test('the policy, the options page and the submission notes state the chosen range and default', async () => {
  for (const file of ['PRIVACY.md', 'docs/PRIVACY_POLICY_TEXT.md', 'docs/AMO_SUBMISSION.md']) {
    const text = (await read(file)).replace(/[*`]/g, '').replace(/\s+/g, ' ');
    assert.ok(text.includes(NEW), `${file} lacks "${NEW}"`);
    assert.ok(text.includes(`default ${SNIPPET_DEFAULT}`), `${file} lacks the default`);
  }
  assert.ok(SNIPPET_EXPLAINER.includes(`first ${NEW} (you choose; default ${SNIPPET_DEFAULT})`));
  const stored = PRIVACY_FACTS.find((f) => f.label === 'Stored');
  assert.ok(stored.text.includes(NEW));
  assert.ok(stored.text.includes(`default ${SNIPPET_DEFAULT}`));
});

test('the README, changelog and CLAUDE.md describe the setting', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CLAUDE.md']) {
    const text = await read(file);
    assert.ok(text.includes(NEW) || text.includes('35 to 280'), `${file} lacks the range`);
  }
});
