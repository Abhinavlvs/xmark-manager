/** (i) Permissions as Chrome reports them, and the extension error log at the end of the run. */

import { readExtensionInfo } from '../chromium-info.mjs';

const sorted = (list) => JSON.stringify([...list].sort());
const HOSTS = ['*://twitter.com/*', '*://x.com/*'];

export async function run(ctx) {
  const { browser, check, id, popup } = ctx;
  const perms = await popup.eval(`new Promise((resolve) => {
    const m = chrome.runtime.getManifest();
    const has = (origin) => new Promise((r) => chrome.permissions.contains({ origins: [origin] }, r));
    chrome.permissions.getAll(async (all) => {
      resolve({
        manifestPerms: m.permissions, manifestHosts: m.host_permissions, all,
        x: await has('*://x.com/*'), t: await has('*://twitter.com/*'), other: await has('https://example.com/*'),
        optional: m.optional_permissions ?? null, optionalHosts: m.optional_host_permissions ?? null,
      });
    });
  })`);
  check(
    '(i) manifest permissions are exactly storage and activeTab',
    sorted(perms.manifestPerms) === sorted(['activeTab', 'storage']),
    JSON.stringify(perms.manifestPerms),
  );
  check(
    '(i) manifest hosts are exactly x.com and twitter.com; no optional permissions',
    sorted(perms.manifestHosts) === sorted(HOSTS) &&
      perms.optional === null &&
      perms.optionalHosts === null,
    JSON.stringify(perms.manifestHosts),
  );
  check(
    '(i) permissions.getAll reports only storage, activeTab and the two hosts',
    sorted(perms.all.permissions) === sorted(['activeTab', 'storage']) &&
      sorted(perms.all.origins) === sorted(HOSTS),
    JSON.stringify(perms.all),
  );
  check(
    '(i) host access to x.com and twitter.com is granted at install; nothing else is',
    perms.x === true && perms.t === true && perms.other === false,
    JSON.stringify({ x: perms.x, t: perms.t, other: perms.other }),
  );
  const info = await readExtensionInfo(browser, id);
  const granted = (info?.permissions?.runtimeHostPermissions?.hosts ?? []).map(
    (h) => `${h.host}:${h.granted}`,
  );
  check(
    '(i) chrome://extensions shows both hosts granted and no all-sites access',
    info?.permissions?.runtimeHostPermissions?.hasAllHosts === false &&
      sorted(granted) === sorted(HOSTS.map((h) => `${h}:true`)),
    JSON.stringify(granted),
  );
  check(
    '(i) no uncaught extension errors were recorded during the whole run',
    (info?.runtimeErrors ?? ['?']).length === 0 && (info?.manifestErrors ?? ['?']).length === 0,
    JSON.stringify(info?.runtimeErrors?.map((e) => e.message)),
  );
}
