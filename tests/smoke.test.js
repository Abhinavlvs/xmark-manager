import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const manifestUrl = new URL('../src/manifest.json', import.meta.url);

async function loadManifest() {
  return JSON.parse(await readFile(manifestUrl, 'utf8'));
}

test('manifest is a Manifest V3 document', async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.manifest_version, 3);
});

test('manifest requests only the minimal permissions', async () => {
  const manifest = await loadManifest();
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.deepEqual(manifest.host_permissions, ['*://x.com/*', '*://twitter.com/*']);
});

test('manifest targets Firefox 140 or newer', async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
});

test('manifest targets Firefox for Android 142 or newer', async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.browser_specific_settings.gecko_android.strict_min_version, '142.0');
});

test('manifest declares the background module and disallows incognito', async () => {
  const manifest = await loadManifest();
  assert.deepEqual(manifest.background, {
    scripts: ['background/background.js'],
    type: 'module',
  });
  assert.equal(manifest.incognito, 'not_allowed');
});

test('manifest wires the toolbar popup', async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
});

test('manifest content script targets only x.com and twitter.com, classic scripts in order', async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.content_scripts.length, 1);
  const [cs] = manifest.content_scripts;
  assert.deepEqual(cs.matches, ['*://x.com/*', '*://twitter.com/*']);
  assert.deepEqual(cs.js, [
    'content/messages.js',
    'content/selectors.js',
    'content/post-extractor.js',
    'content/dom-util.js',
    'content/styles.js',
    'content/save-button.js',
    'content/panel-folder.js',
    'content/panel-form.js',
    'content/placement.js',
    'content/panel-host.js',
    'content/panel.js',
    'content/injector.js',
    'content/main.js',
  ]);
  assert.equal(cs.run_at, 'document_idle');
  assert.equal(cs.all_frames, false);
  assert.equal(cs.css, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('manifest wires the options page in its own tab and adds no permission for it', async () => {
  const manifest = await loadManifest();
  assert.deepEqual(manifest.options_ui, { page: 'options/options.html', open_in_tab: true });
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  await access(new URL('../src/options/options.html', import.meta.url));
});
