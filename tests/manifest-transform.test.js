import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BROWSERS,
  CHROME_MIN_VERSION,
  SAFARI_MIN_VERSION,
  ICON_SETS,
  transformManifest,
} from '../scripts/manifest-transform.mjs';

const source = JSON.parse(await readFile(new URL('../src/manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const out = Object.fromEntries(BROWSERS.map((b) => [b, transformManifest(source, b)]));

test('BROWSERS lists the three targets', () => {
  assert.deepEqual(BROWSERS, ['firefox', 'chrome', 'safari']);
});

test('firefox manifest is the source, unchanged, and a separate copy', () => {
  assert.deepEqual(out.firefox, source);
  assert.notEqual(out.firefox, source);
});

test('the source manifest is never mutated', () => {
  const before = JSON.stringify(source);
  for (const b of BROWSERS) transformManifest(source, b);
  assert.equal(JSON.stringify(source), before);
});

test('unknown browser is rejected', () => {
  assert.throws(() => transformManifest(source, 'edge'), /unknown browser/);
});

for (const b of BROWSERS) {
  test(`${b}: permissions, hosts, content scripts, popup and options are identical`, () => {
    const m = out[b];
    assert.equal(m.manifest_version, 3);
    assert.deepEqual(m.permissions, ['storage', 'activeTab']);
    assert.deepEqual(m.host_permissions, ['*://x.com/*', '*://twitter.com/*']);
    assert.deepEqual(m.content_scripts, source.content_scripts);
    assert.equal(m.action.default_popup, 'popup/popup.html');
    assert.equal(m.action.default_title, source.action.default_title);
    assert.deepEqual(m.options_ui, { page: 'options/options.html', open_in_tab: true });
    if (b !== 'safari') assert.equal(m.incognito, 'not_allowed');
    assert.equal(m.version, pkg.version);
    assert.equal(m.name, source.name);
  });

  test(`${b}: nothing forbidden and no web_accessible_resources`, () => {
    const m = out[b];
    for (const bad of ['cookies', 'webRequest', 'tabs', 'history', 'scripting', '<all_urls>']) {
      assert.ok(!m.permissions.includes(bad), bad);
      assert.ok(!m.host_permissions.includes(bad), bad);
    }
    assert.equal(m.web_accessible_resources, undefined);
    assert.equal(m.optional_permissions, undefined);
    assert.equal(m.externally_connectable, undefined);
  });
}

test('chrome: service worker module background, no Firefox-only keys', () => {
  const m = out.chrome;
  assert.deepEqual(m.background, { service_worker: 'background/background.js', type: 'module' });
  assert.equal(m.browser_specific_settings, undefined);
  assert.equal(m.action.theme_icons, undefined);
  assert.equal(m.minimum_chrome_version, CHROME_MIN_VERSION);
  assert.equal(CHROME_MIN_VERSION, '98', 'max first-supported version: structuredClone');
  assert.equal(JSON.stringify(m).includes('data_collection_permissions'), false);
});

test('safari: background scripts module, safari min version, no Firefox-only keys', () => {
  const m = out.safari;
  assert.deepEqual(m.background, { scripts: ['background/background.js'], type: 'module' });
  assert.deepEqual(m.browser_specific_settings, {
    safari: { strict_min_version: SAFARI_MIN_VERSION },
  });
  assert.equal(m.action.theme_icons, undefined);
  assert.equal(m.minimum_chrome_version, undefined);
  assert.equal(JSON.stringify(m).includes('gecko'), false);
  assert.equal(m.incognito, undefined, 'Safari does not support incognito: not_allowed');
  assert.ok(parseFloat(SAFARI_MIN_VERSION) >= 16.4, 'module background needs Safari 16.4+');
});

test('chrome and safari reference PNG icons only, in the four required sizes', () => {
  for (const b of ['chrome', 'safari']) {
    const m = out[b];
    assert.deepEqual(Object.keys(m.icons), ['16', '32', '48', '128']);
    assert.deepEqual(Object.keys(m.action.default_icon), ['16', '32']);
    for (const p of [...Object.values(m.icons), ...Object.values(m.action.default_icon)]) {
      assert.match(p, /^icons\/(icon|toolbar)-(16|32|48|128)\.png$/);
    }
    assert.deepEqual(
      m.icons,
      Object.fromEntries(Object.entries(ICON_SETS[b].icons).map(([s, v]) => [s, v.bundle])),
    );
  }
});

test('chrome uses the app icon (white on black) everywhere: readable on light and dark toolbars', () => {
  const files = Object.values(ICON_SETS.chrome.icons).map((i) => i.from);
  assert.deepEqual(
    files,
    [16, 32, 48, 128].map((s) => `xmark-appicon-${s}.png`),
  );
  assert.deepEqual(out.chrome.action.default_icon, {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
  });
});

test('safari toolbar uses the black template-style monogram, icons use the app icon', () => {
  assert.deepEqual(out.safari.action.default_icon, {
    16: 'icons/toolbar-16.png',
    32: 'icons/toolbar-32.png',
  });
  assert.deepEqual(ICON_SETS.safari.action[16].from, 'xmark-black-16.png');
  assert.deepEqual(ICON_SETS.safari.icons[48].from, 'xmark-appicon-48.png');
});

test('firefox keeps SVG icons and theme icons', () => {
  assert.equal(out.firefox.action.default_icon, 'icons/icon-dark.svg');
  assert.equal(out.firefox.action.theme_icons.length, 1);
  assert.equal(out.firefox.browser_specific_settings.gecko.strict_min_version, '140.0');
});
