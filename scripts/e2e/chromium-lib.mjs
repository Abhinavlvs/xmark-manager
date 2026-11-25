/**
 * Shared helpers for the real-Chromium e2e scripts (chromium-smoke.mjs, chromium-persistence.mjs).
 * Zero dependencies. Needs Node 20 with `--experimental-websocket` (the npm scripts pass it) or a Node
 * with a global WebSocket (Node 22+); the scripts SKIP when there is none.
 *
 * Only Chrome for Testing (or Chromium) works: branded Google Chrome 137+ ignores `--load-extension`.
 *
 * Network safety, every launch:
 * - `--host-resolver-rules` maps x.com/twitter.com to a local TLS server and makes EVERY other host
 *   name fail to resolve;
 * - `--no-proxy-server`, because host-resolver rules do not apply when a proxy resolves the name
 *   (a system or PAC proxy would otherwise receive `CONNECT x.com:443`);
 * - only the throwaway certificate is trusted (`--ignore-certificate-errors-spki-list`).
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectCdp, getJSON, pageFor, sendMessage, sleep, until } from './cdp.mjs';
import { fixtureHtml } from './local-x.mjs';
import { ROOT } from './lib.mjs';
import { createThrowawayCert } from './tls.mjs';

export { ROOT, sleep, until };
export const CHROME_DIST = join(ROOT, 'dist', 'chrome');

/** @returns {string | null} the Chrome for Testing binary, or null after printing SKIP */
export function resolveChrome() {
  const bin = process.env.CHROME_BIN;
  if (!bin || !existsSync(bin)) {
    console.log(
      `SKIP: set CHROME_BIN to a Chrome for Testing / Chromium binary (got ${bin ? `${bin}, not found` : 'nothing'}). ` +
        'See scripts/e2e/README.md.',
    );
    return null;
  }
  if (typeof WebSocket === 'undefined') {
    console.log('SKIP: this Node has no WebSocket; run with --experimental-websocket or Node 22+.');
    return null;
  }
  return bin;
}

/** Build dist/chrome with the repo's own build script. */
export function buildChrome() {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs'), 'chrome'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}

export const readManifest = (dir = CHROME_DIST) =>
  JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

export const makeProfileDir = (prefix = 'xmark-chrome-') => mkdtempSync(join(tmpdir(), prefix));
export const removeDir = (dir) => rmSync(dir, { recursive: true, force: true });

/**
 * Local stand-in for x.com and twitter.com: one TLS server (throwaway certificate) serving the
 * fixture without its dev scripts. `hits` lists every Host header it saw.
 */
export async function startLocalX() {
  const cert = createThrowawayCert();
  const page = fixtureHtml(ROOT);
  const hits = [];
  const server = createHttpsServer({ key: cert.key, cert: cert.cert }, (req, res) => {
    hits.push(String(req.headers.host));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
  });
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  return {
    port,
    hits,
    spkiSha256: cert.spkiSha256,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }).finally(() => cert.remove()),
  };
}

const hostRules = (port) =>
  [
    ...(port
      ? [
          `MAP x.com 127.0.0.1:${port}`,
          `MAP *.x.com 127.0.0.1:${port}`,
          `MAP twitter.com 127.0.0.1:${port}`,
          `MAP *.twitter.com 127.0.0.1:${port}`,
          `MAP xmark-local-check.test 127.0.0.1:${port}`,
        ]
      : []),
    'MAP * ~NOTFOUND',
    'EXCLUDE 127.0.0.1',
  ].join(', ');

/**
 * Start Chrome on `profileDir` with the extension loaded and return a CDP handle.
 * @param {object} opts
 * @param {string} opts.bin
 * @param {string} opts.profileDir
 * @param {string} [opts.extDir]
 * @param {{port: number, spkiSha256: string}} [opts.localX] the local x.com stand-in
 * @param {string[]} [opts.extraArgs]
 * @param {boolean} [opts.noProxy] pass --no-proxy-server (default true; false only in the proxy negative test)
 * @param {(url: string) => boolean} [opts.allowUrl] openPage refuses every other URL
 * @param {number} [opts.watchdogMs] kill Chrome and fail the run after this long (default 5 minutes)
 */
export async function launchChrome({
  bin,
  profileDir,
  extDir = CHROME_DIST,
  localX,
  extraArgs = [],
  noProxy = true,
  allowUrl = () => true,
  watchdogMs = 5 * 60 * 1000,
}) {
  try {
    rmSync(join(profileDir, 'DevToolsActivePort'));
  } catch {
    // first launch
  }
  const args = [
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    `--host-resolver-rules=${hostRules(localX?.port)}`,
    ...(localX ? [`--ignore-certificate-errors-spki-list=${localX.spkiSha256}`] : []),
    ...(noProxy ? ['--no-proxy-server'] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    ...extraArgs,
    'about:blank',
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  let watchdogFired = false;
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    console.log(`FAIL watchdog: Chrome ran longer than ${watchdogMs} ms; killing it`);
    proc.kill('SIGKILL');
  }, watchdogMs);
  exited.then(() => clearTimeout(watchdog));

  let port = 0;
  for (let i = 0; i < 150 && !port; i++) {
    if (proc.exitCode !== null) break;
    await sleep(100);
    try {
      port = Number(readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    } catch {
      // not written yet
    }
  }
  if (!port) {
    proc.kill('SIGKILL');
    throw new Error(`Chrome did not expose a DevTools port; stderr=${stderr.slice(0, 400)}`);
  }
  const version = await getJSON(port, '/json/version');
  const cdp = await connectCdp(version.webSocketDebuggerUrl);

  const browser = {
    pid: proc.pid,
    port,
    version,
    send: (method, params) => cdp.send(method, params),
    onEvent: cdp.onEvent,
    stderr: () => stderr,
    watchdogFired: () => watchdogFired,
    targets: () => getJSON(port, '/json/list'),
    /** Quit with Browser.close and wait for the process; kill it only if it does not leave. */
    async quit(timeoutMs = 20000) {
      try {
        await cdp.send('Browser.close');
      } catch {
        // the socket may close first
      }
      let timer;
      const result = await Promise.race([
        exited.then(() => 'exited'),
        new Promise((resolve) => (timer = setTimeout(resolve, timeoutMs))),
      ]);
      clearTimeout(timer);
      if (result !== 'exited') {
        proc.kill('SIGKILL');
        await exited;
        return false;
      }
      return true;
    },
    kill() {
      clearTimeout(watchdog);
      if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
    },
    /** The service worker whose script is OUR background file (Chrome for Testing has component workers). */
    async findWorker(scriptFile, timeoutMs = 10000) {
      return until(
        async () =>
          (await browser.targets()).find(
            (x) =>
              x.type === 'service_worker' &&
              x.url.startsWith('chrome-extension://') &&
              x.url.endsWith(`/${scriptFile}`),
          ),
        { timeoutMs },
      );
    },
    async attach(targetId) {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      return pageFor(cdp, targetId, sessionId);
    },
    /** Open a URL in a new tab (or another browser context) and attach a session to it. */
    async openPage(url, { browserContextId } = {}) {
      if (!allowUrl(url)) throw new Error(`refusing to open ${url}: not allowed in this run`);
      const { targetId } = await cdp.send('Target.createTarget', {
        url,
        ...(browserContextId ? { browserContextId } : {}),
      });
      return browser.attach(targetId);
    },
    sendMessage,
  };
  return browser;
}

export const idFromWorker = (target) => new URL(target.url).host;
