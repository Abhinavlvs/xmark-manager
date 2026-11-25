/**
 * Pure manifest transformation: `src/manifest.json` is the Firefox manifest (the single source of
 * truth); the Chrome and Safari manifests are derived from it by the rules below.
 * Permissions, host patterns, content scripts, popup and options are never altered.
 *
 * Chrome (MV3)
 *   - background `{scripts, type}` -> `{service_worker: <first script>, type: "module"}`
 *     (Chrome MV3 has no background.scripts; module service workers need Chrome 92+).
 *   - removed: `browser_specific_settings` (gecko ids, data_collection_permissions),
 *     `action.theme_icons` (Firefox only; Chrome ignores it with a warning).
 *   - added: `minimum_chrome_version`.
 *   - icons: SVG is not supported for icons/action in Chrome, so PNG paths (see ICON_SETS).
 *   - kept: `incognito: "not_allowed"` (Chrome docs: the extension cannot be enabled in incognito mode, available
 *     since Chrome 47, so Chrome never runs it in private windows), options_ui (open_in_tab).
 * Safari (Web Extension, MV3)
 *   - background stays `{scripts, type: "module"}`: Safari honours scripts/page and prefers them to
 *     service_worker; service workers in Safari lack host-permission CORS relief (see report).
 *   - `browser_specific_settings` replaced by `{safari: {strict_min_version}}` (gecko keys are unknown to Safari).
 *   - removed: `action.theme_icons` (unsupported). icons: PNG (SVG toolbar icons are not supported).
 *   - removed: `incognito` (MDN BCD: `not_allowed` is NOT supported in Safari, webkit.org/b/280785; Safari lets the
 *     user decide whether the extension runs in private windows). Saves in private windows are therefore refused
 *     by the extension's own checks (popup: active tab flag; content script: sender.tab.incognito).
 *   - Safari ignores `options_ui.open_in_tab` (options always open in a tab); kept, harmless.
 */

export const BROWSERS = ['firefox', 'chrome', 'safari'];

/**
 * Justified floor = the highest "first supported" Chrome version over (MDN BCD v8.1.10):
 *  (a) manifest keys: background.type module service workers 92, action / host_permissions /
 *      service_worker 88, incognito not_allowed 47, options_ui 40;
 *  (b) extension APIs: all older (tabs.Tab.incognito 16, storage.local 19, permissions 16); promise
 *      forms (sendMessage promises since 99) are not needed, the adapter uses callbacks on Chrome;
 *  (c) JS built-ins and syntax in the shipped code: structuredClone 98 (HIGHEST; repository),
 *      Object.hasOwn 93 (handlers, panel), Array.prototype.at 92, crypto.randomUUID 92, optional
 *      chaining and nullish 80, :focus-visible 86. scrollbar-width/-color (121) is progressive
 *      enhancement with a ::-webkit-scrollbar fallback and is deliberately excluded.
 * tests/browser-floor.test.js scans src/ and fails if the floor and this table disagree.
 */
export const CHROME_MIN_VERSION = '98';
/**
 * Project choice, not a technical floor (the floor is 16.4, module background scripts; used built-ins
 * need at most 15.4). Private-window protection relies on `sender.tab.incognito` (content scripts)
 * and `Tab.incognito` from tabs.query (popup), both Safari 14, not on `inIncognitoContext`.
 */
export const SAFARI_MIN_VERSION = '18.0';

const app = (size) => ({ from: `xmark-appicon-${size}.png`, bundle: `icons/icon-${size}.png` });
const toolbar = (size) => ({
  from: `xmark-black-${size}.png`,
  bundle: `icons/toolbar-${size}.png`,
});
const appIcons = { 16: app(16), 32: app(32), 48: app(48), 128: app(128) };

/**
 * PNG icons per browser: bundle path and the assets/branding/export file it is copied from.
 * Chrome has no theme-aware icons, so every size uses the app icon (white monogram on a black
 * rounded square), which is readable on light and dark toolbars. Safari treats grayscale toolbar
 * images as template icons tinted by the system (MDN BCD note, not verified on a device), so its
 * toolbar uses the black transparent monogram while icons use the app icon.
 */
export const ICON_SETS = {
  chrome: { icons: appIcons, action: { 16: app(16), 32: app(32) } },
  safari: { icons: appIcons, action: { 16: toolbar(16), 32: toolbar(32) } },
};

/** Unique files a browser bundle must contain: [{from, bundle}]. */
export function bundleIcons(browser) {
  const { icons, action } = ICON_SETS[browser];
  return [
    ...new Map(
      [...Object.values(icons), ...Object.values(action)].map((i) => [i.bundle, i]),
    ).values(),
  ];
}

function withPngIcons(manifest, browser) {
  const { icons, action } = ICON_SETS[browser];
  const paths = (set) => Object.fromEntries(Object.entries(set).map(([s, v]) => [s, v.bundle]));
  const next = { ...manifest.action, default_icon: paths(action) };
  delete next.theme_icons;
  return { ...manifest, icons: paths(icons), action: next };
}

function toChrome(manifest) {
  const out = withPngIcons(manifest, 'chrome');
  delete out.browser_specific_settings;
  const [script] = manifest.background.scripts;
  return {
    ...out,
    minimum_chrome_version: CHROME_MIN_VERSION,
    background: { service_worker: script, type: 'module' },
  };
}

function toSafari(manifest) {
  const out = withPngIcons(manifest, 'safari');
  delete out.incognito;
  return {
    ...out,
    browser_specific_settings: { safari: { strict_min_version: SAFARI_MIN_VERSION } },
  };
}

/**
 * @param {object} source the Firefox manifest (src/manifest.json)
 * @param {'firefox'|'chrome'|'safari'} browser
 * @returns {object} a new manifest object; `source` is never mutated
 */
export function transformManifest(source, browser) {
  const copy = structuredClone(source);
  if (browser === 'firefox') return copy;
  if (browser === 'chrome') return toChrome(copy);
  if (browser === 'safari') return toSafari(copy);
  throw new Error(`unknown browser: ${browser}`);
}
