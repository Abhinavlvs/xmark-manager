/**
 * Mutation runs for the real-Chromium smoke test: `E2E_MUTATE=<name> npm run e2e:chrome`.
 * Each one copies the built bundle (dist/chrome is never touched) into a temp dir, breaks one rule
 * there, runs the same checks against the copy and succeeds only if the named checks FAIL. That shows
 * those checks can fail, i.e. that they are not vacuous.
 */

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME_DIST, removeDir } from './chromium-lib.mjs';

/** @type {Record<string, {what: string, files?: Record<string, [RegExp, string][]>, manifest?: (m: object) => void, expectFail: string[]}>} */
export const MUTATIONS = {
  'guard-allow-list-posts': {
    what: 'the content-script allow list also lets LIST_POSTS through',
    files: {
      'background/guard.js': [
        [/MSG\.OPEN_FOLDER_SETTINGS,\s*\]\);/, 'MSG.OPEN_FOLDER_SETTINGS, MSG.LIST_POSTS]);'],
      ],
    },
    expectFail: ['(d) content script is rejected for LIST_POSTS'],
  },
  'no-trusted-check': {
    what: 'the isTrusted checks are stripped from the content scripts',
    files: {
      'content/injector.js': [[/if \(!event\.isTrusted\) return;/, '']],
      'content/panel-folder.js': [[/!event\.isTrusted \|\| /g, '']],
      'content/panel.js': [
        [/!event\.isTrusted \|\| /g, ''],
        [/event\.isTrusted && /g, ''],
      ],
    },
    expectFail: ['(e) a synthetic (isTrusted false) click on the real button opens no panel'],
  },
  'incognito-spanning': {
    what: 'the incognito key is removed from the manifest (Chrome default: spanning)',
    manifest: (m) => {
      delete m.incognito;
    },
    expectFail: [
      '(f) manifest incognito is "not_allowed"',
      '(f) chrome://extensions: incognito access cannot be enabled',
      '(f) asking Chrome to allow incognito access changes nothing',
      '(f) no content script ran in the off-the-record context',
    ],
  },
};

/** @returns {{dir: string, expectFail: string[], what: string, cleanup: () => void}} */
export function prepareMutation(name) {
  const m = MUTATIONS[name];
  if (!m)
    throw new Error(`unknown E2E_MUTATE=${name}; known: ${Object.keys(MUTATIONS).join(', ')}`);
  const dir = mkdtempSync(join(tmpdir(), 'xmark-chrome-mutant-'));
  cpSync(CHROME_DIST, dir, { recursive: true });
  for (const [file, edits] of Object.entries(m.files ?? {})) {
    let text = readFileSync(join(dir, file), 'utf8');
    for (const [re, to] of edits) {
      if (!re.test(text)) throw new Error(`mutation ${name}: ${re} not found in ${file}`);
      text = text.replace(re, to);
    }
    writeFileSync(join(dir, file), text);
  }
  if (m.manifest) {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    m.manifest(manifest);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
  return { dir, expectFail: m.expectFail, what: m.what, cleanup: () => removeDir(dir) };
}
