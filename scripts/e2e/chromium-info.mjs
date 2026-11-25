/** What Chrome itself reports about the loaded extension, through chrome://extensions. */

import { until } from './cdp.mjs';

/** Open chrome://extensions and read what Chrome knows about the extension (warnings, errors, access). */
export async function readExtensionInfo(browser, extId, { setIncognitoAccess } = {}) {
  const page = await browser.openPage('chrome://extensions/');
  try {
    const call = (body) =>
      page
        .eval(
          `new Promise((resolve) => {
            if (!chrome.developerPrivate) return resolve(null);
            ${body}
          })`,
        )
        .catch(() => null);
    if (setIncognitoAccess !== undefined) {
      await until(() => call('resolve(true)'));
      // Chrome (138+) disables an unpacked extension on reload unless Developer mode is on.
      await call(
        `chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, () => resolve(true))`,
      );
      await call(
        `chrome.developerPrivate.updateExtensionConfiguration(
          { extensionId: ${JSON.stringify(extId)}, incognitoAccess: ${setIncognitoAccess} }, () => resolve(true))`,
      );
    }
    // After a setting change that reloads the extension, wait until it is enabled again.
    return await until(
      async () => {
        const info =
          await call(`chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, (list) =>
          resolve((list || []).find((e) => e.id === ${JSON.stringify(extId)}) || null))`);
        const settled =
          setIncognitoAccess === undefined ||
          (info?.state === 'ENABLED' && !info.disableReasons?.reloading);
        return info && settled ? info : null;
      },
      { timeoutMs: 10000, everyMs: 200 },
    );
  } finally {
    await page.close();
  }
}
