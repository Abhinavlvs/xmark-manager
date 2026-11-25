/**
 * (f) Private windows. An off-the-record context (CDP Target.createBrowserContext) follows the same
 * incognito rules as a window the user opens.
 *
 * What this can show: with `incognito: "not_allowed"` Chrome offers no way to enable incognito access
 * (`incognitoAccess.isEnabled` is false in chrome://extensions data and asking to enable it changes
 * nothing), and the extension is inactive in an off-the-record context. The positive control is the
 * mutation run E2E_MUTATE=incognito-spanning (scripts/e2e/README.md): the same bundle with the key
 * removed CAN be enabled, and then it DOES run there, so these checks fail.
 */

import { idFromWorker, until } from '../chromium-lib.mjs';
import { readExtensionInfo } from '../chromium-info.mjs';

export async function run(ctx) {
  const { browser, check, id, manifest, swFile } = ctx;
  check('(f) manifest incognito is "not_allowed"', manifest.incognito === 'not_allowed');

  const before = await readExtensionInfo(browser, id);
  check(
    '(f) chrome://extensions: incognito access cannot be enabled (isEnabled false) and is not active',
    before?.incognitoAccess?.isEnabled === false && before?.incognitoAccess?.isActive === false,
    JSON.stringify(before?.incognitoAccess),
  );

  // Ask Chrome to switch it on, as the "Allow in Incognito" toggle would.
  const after = await readExtensionInfo(browser, id, { setIncognitoAccess: true });
  await browser.findWorker(swFile); // the extension reloads when the setting changes
  check(
    '(f) asking Chrome to allow incognito access changes nothing (still not active)',
    after?.incognitoAccess?.isActive === false,
    JSON.stringify(after?.incognitoAccess),
  );

  const { browserContextId } = await browser.send('Target.createBrowserContext', {
    disposeOnDetach: false,
  });
  const priv = await browser.openPage('https://x.com/home', { browserContextId });
  const privContexts = await priv.trackContexts();
  const title = await until(() => priv.eval('document.title').catch(() => ''));
  check(
    '(f) control: the same fixture page loaded in the off-the-record context',
    String(title).includes('x fixture'),
    String(title),
  );
  // A negative needs a bounded wait: give a content script (document_idle) 4 s to appear.
  const ran = await until(
    async () => (await priv.eval(`document.querySelectorAll('[data-xmark-host]').length`)) > 0,
    { timeoutMs: 4000 },
  );
  const extContexts = privContexts.filter((c) =>
    String(c.origin).startsWith('chrome-extension://'),
  );
  check(
    '(f) no content script ran in the off-the-record context (no Save host, no extension world)',
    !ran && extContexts.length === 0,
    `host=${!!ran} extensionContexts=${extContexts.length}`,
  );
  await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});

  // The page that was open may have been reloaded with the extension: use a fresh popup from here on.
  const worker = await browser.findWorker(swFile);
  ctx.id = worker ? idFromWorker(worker) : id;
  ctx.popup = await browser.openPage(`chrome-extension://${ctx.id}/popup/popup.html`);
  const allowed = await until(() =>
    ctx.popup
      .eval(`new Promise((resolve) => chrome.extension.isAllowedIncognitoAccess(resolve))`)
      .then((v) => (v === false ? 'false' : String(v)))
      .catch(() => false),
  );
  check(
    '(f) chrome.extension.isAllowedIncognitoAccess() is false',
    allowed === 'false',
    String(allowed),
  );
}
