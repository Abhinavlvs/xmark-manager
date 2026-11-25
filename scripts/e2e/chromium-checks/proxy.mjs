/**
 * Proxy negative test. Host-resolver rules do not apply when a proxy resolves the name, so every
 * launch passes --no-proxy-server. Here a proxy IS configured (--proxy-server=127.0.0.1:1, a closed
 * port: nothing leaves the machine): without --no-proxy-server the local fixture must NOT load
 * (the request went to the proxy), with it the fixture loads (the flag overrides the proxy setting).
 * It shows the flag has effect for a browser-level proxy setting; a system or PAC proxy was NOT tested.
 */

import { launchChrome, makeProfileDir, removeDir, until } from '../chromium-lib.mjs';

const URL = 'https://xmark-local-check.test/';

async function fixtureLoads({ bin, localX, noProxy }) {
  const profileDir = makeProfileDir('xmark-chrome-proxy-');
  const browser = await launchChrome({
    bin,
    profileDir,
    localX,
    noProxy,
    extraArgs: ['--proxy-server=127.0.0.1:1'],
    allowUrl: (u) => u === URL,
    watchdogMs: 60000,
  });
  try {
    const page = await browser.openPage(URL);
    const title = await until(
      () =>
        page
          .eval('document.title')
          .then((t) => (String(t).includes('x fixture') ? t : false))
          .catch(() => false),
      { timeoutMs: 5000 },
    );
    return !!title;
  } finally {
    await browser.quit();
    browser.kill();
    removeDir(profileDir);
  }
}

export async function run(ctx) {
  const { bin, check, localX } = ctx;
  const without = await fixtureLoads({ bin, localX, noProxy: false });
  const hitsAfterNegative = localX.hits.length;
  const withFlag = await fixtureLoads({ bin, localX, noProxy: true });
  check(
    '(0) proxy control: with a proxy configured and no --no-proxy-server, the fixture does NOT load',
    without === false && hitsAfterNegative === 0,
    `loaded=${without} fixtureHits=${hitsAfterNegative}`,
  );
  check(
    '(0) with --no-proxy-server the fixture loads even though a proxy is configured',
    withFlag === true,
    `loaded=${withFlag}`,
  );
}
