import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformManifest } from '../scripts/manifest-transform.mjs';

const source = JSON.parse(await readFile(new URL('../src/manifest.json', import.meta.url), 'utf8'));
const safari = transformManifest(source, 'safari');
const firefox = transformManifest(source, 'firefox');

test('safari bundle asks for exactly storage + activeTab and the two X hosts', () => {
  assert.deepEqual(safari.permissions, ['storage', 'activeTab']);
  assert.deepEqual(safari.host_permissions, ['*://x.com/*', '*://twitter.com/*']);
  assert.deepEqual(safari.permissions, firefox.permissions);
  assert.deepEqual(safari.host_permissions, firefox.host_permissions);
  assert.deepEqual(safari.content_scripts, firefox.content_scripts);
  assert.equal(safari.optional_permissions, undefined);
});

test('safari manifest has no incognito key and no Chrome or Firefox-only keys', () => {
  for (const key of ['incognito', 'minimum_chrome_version', 'theme_icons']) {
    assert.equal(JSON.stringify(safari).includes(`"${key}"`), false, key);
  }
  assert.equal(safari.browser_specific_settings.gecko, undefined);
  assert.equal(safari.background.service_worker, undefined);
});
