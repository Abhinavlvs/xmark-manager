#!/usr/bin/env node
/**
 * Real-Chromium smoke test. Zero dependencies (Node 20 with --experimental-websocket, or Node 22+).
 *
 * Loads dist/chrome unpacked into Chrome for Testing (headless, throwaway profile) and drives it over the
 * DevTools protocol. Chrome resolves x.com and twitter.com to a local TLS server that serves the dev
 * fixture and fails to resolve every other host (and uses no proxy), so the real X is never contacted.
 * Env: CHROME_BIN; E2E_MUTATE=<name> runs a mutation (see chromium-mutate.mjs and scripts/e2e/README.md).
 * The checks live in chromium-checks/*.mjs.
 */

import { createReporter } from './lib.mjs';
import {
  CHROME_DIST,
  buildChrome,
  launchChrome,
  makeProfileDir,
  readManifest,
  removeDir,
  resolveChrome,
  startLocalX,
} from './chromium-lib.mjs';
import { prepareMutation } from './chromium-mutate.mjs';
import * as basics from './chromium-checks/basics.mjs';
import * as fixture from './chromium-checks/fixture.mjs';
import * as guard from './chromium-checks/guard.mjs';
import * as panel from './chromium-checks/panel.mjs';
import * as incognito from './chromium-checks/incognito.mjs';
import * as worker from './chromium-checks/worker.mjs';
import * as permissions from './chromium-checks/permissions.mjs';
import * as savedPage from './chromium-checks/saved-page.mjs';
import * as proxy from './chromium-checks/proxy.mjs';

const bin = resolveChrome();
if (!bin) process.exit(0);

const reporter = createReporter();
const outcomes = [];
const check = (name, ok, detail = '') => {
  outcomes.push({ name, ok });
  reporter.check(name, ok, detail);
};

async function main() {
  buildChrome();
  const mutation = process.env.E2E_MUTATE ? prepareMutation(process.env.E2E_MUTATE) : null;
  if (mutation) console.log(`INFO mutation ${process.env.E2E_MUTATE}: ${mutation.what}`);
  const extDir = mutation?.dir ?? CHROME_DIST;
  const manifest = readManifest(extDir);
  const profileDir = makeProfileDir();
  const localX = await startLocalX();
  let browser = null;
  try {
    const ctx = { bin, check, localX, manifest, swFile: manifest.background.service_worker };
    await proxy.run(ctx);
    browser = await launchChrome({ bin, profileDir, extDir, localX });
    ctx.browser = browser;
    console.log(`INFO ${browser.version.Browser} (headless, throwaway profile)`);
    if (await basics.run(ctx)) {
      await fixture.run(ctx);
      await guard.run(ctx);
      await panel.run(ctx);
      await savedPage.run(ctx);
      await incognito.run(ctx);
      await worker.run(ctx);
      await permissions.run(ctx);
    }
    console.log(`INFO requests served locally for hosts: ${[...new Set(localX.hits)].join(', ')}`);
    check('(a) Chrome quit cleanly', await browser.quit());
    browser = null;
  } finally {
    browser?.kill();
    await localX.close();
    removeDir(profileDir);
    mutation?.cleanup();
  }
  return mutation;
}

let mutation = null;
try {
  mutation = await main();
} catch (err) {
  check('e2e run completed without harness error', false, err.stack ?? err.message);
}
if (process.env.E2E_MUTATE && mutation) {
  // A mutation run passes only if every named check FAILED (each failure is expected).
  const missing = mutation.expectFail.filter(
    (prefix) => !outcomes.some((o) => o.name.startsWith(prefix) && !o.ok),
  );
  for (const prefix of mutation.expectFail) {
    console.log(
      `${missing.includes(prefix) ? 'MUTATION NOT DETECTED' : 'MUTATION DETECTED'} ${prefix}`,
    );
  }
  process.exit(missing.length === 0 ? 0 : 1);
}
process.exit(reporter.finish());
