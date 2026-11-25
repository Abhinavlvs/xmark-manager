/**
 * Shared helpers for the real-Firefox e2e scripts. Zero dependencies (Node 20+).
 * Used by firefox-smoke.mjs and persistence.mjs; see scripts/e2e/README.md.
 */

import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const SRC = join(ROOT, 'src');
export const EXT_ID = '{6c820dd8-f422-43e5-bb44-e392b7fac38a}';
export const EXT_UUID = '5b0f1c1e-7a52-4f0e-9d3b-2f6a1c0e8d41';
export const POPUP_URL = `moz-extension://${EXT_UUID}/popup/popup.html`;
export const DEFAULT_FIREFOX = '/Applications/Firefox.app/Contents/MacOS/firefox';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const p = join(dir, name);
    if (dir && existsSync(p)) return p;
  }
  return null;
}

/** @returns {{firefoxBin: string, geckoBin: string} | null} null (after printing SKIP) if missing */
export function resolveBins() {
  const firefoxBin = process.env.FIREFOX_BIN || DEFAULT_FIREFOX;
  const geckoBin = process.env.GECKODRIVER_BIN || findOnPath('geckodriver');
  if (!existsSync(firefoxBin) || !geckoBin || !existsSync(geckoBin)) {
    console.log(
      `SKIP: need Firefox (FIREFOX_BIN, tried ${firefoxBin}) and geckodriver ` +
        `(GECKODRIVER_BIN or on PATH). See scripts/e2e/README.md.`,
    );
    return null;
  }
  return { firefoxBin, geckoBin };
}

/** Collects PASS/FAIL lines; `finish()` prints the summary and returns the exit code. */
export function createReporter() {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push(ok);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
    },
    finish() {
      const failed = results.filter((ok) => !ok).length;
      console.log(
        failed
          ? `\n${failed} of ${results.length} checks FAILED`
          : `\nAll ${results.length} checks passed`,
      );
      return failed ? 1 : 0;
    },
  };
}

export function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

/**
 * Start geckodriver (with --allow-system-access, needed for the chrome context).
 * A free port is picked by binding and releasing one, which can race; retried once.
 */
export async function startGecko(geckoBin) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await tryStartGecko(geckoBin);
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
}

async function tryStartGecko(geckoBin) {
  const port = await freePort();
  const proc = spawn(
    geckoBin,
    ['--port', String(port), '--host', '127.0.0.1', '--allow-system-access'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const exited = new Promise((res) => proc.once('exit', res));
  const stop = async () => {
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    proc.kill('SIGTERM');
    const timer = sleep(2000).then(() => 'timeout');
    if ((await Promise.race([exited, timer])) === 'timeout') {
      proc.kill('SIGKILL');
      await exited;
    }
  };
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 50 && !ready && proc.exitCode === null; i++) {
    try {
      await fetch(`${base}/status`);
      ready = true;
    } catch {
      await sleep(100);
    }
  }
  if (!ready) {
    await stop();
    throw new Error(`geckodriver did not answer on port ${port}: ${log.slice(0, 300)}`);
  }
  async function api(method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${path}: ${json.value?.error} ${json.value?.message}`);
    return json.value;
  }
  return { api, log: () => log, stop };
}

/** PIDs of processes whose command line contains `needle` (e.g. a unique profile path). */
export async function pidsWithArg(needle) {
  const { stdout } = await execFileP('ps', ['-axo', 'pid=,command=']);
  return stdout
    .split('\n')
    .filter((l) => l.includes(needle))
    .map((l) => Number(l.trim().split(/\s+/)[0]))
    .filter((pid) => Number.isInteger(pid) && pid !== process.pid);
}

/**
 * Create a WebDriver session and return helpers bound to it.
 * @param {{api: Function}} gecko
 * @param {{firefoxBin: string, profileDir: string, prefs?: object, capabilities?: object}} opts
 */
export async function createSession(
  gecko,
  { firefoxBin, profileDir, prefs = {}, capabilities = {} },
) {
  const created = await gecko.api('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        acceptInsecureCerts: true,
        ...capabilities,
        'moz:firefoxOptions': {
          binary: firefoxBin,
          args: ['-headless', '-profile', profileDir],
          prefs: {
            'extensions.webextensions.uuids': JSON.stringify({ [EXT_ID]: EXT_UUID }),
            ...prefs,
          },
          log: { level: 'warn' },
        },
      },
    },
  });
  const sessionId = created.sessionId;
  const pids = await pidsWithArg(profileDir);
  const session = (method, path, body) => gecko.api(method, `/session/${sessionId}${path}`, body);
  const execAsync = (script, args = []) => session('POST', '/execute/async', { script, args });

  /** Open the popup page as a tab through the chrome context and switch to it. */
  async function openPopup() {
    const before = new Set(await session('GET', '/window/handles'));
    await session('POST', '/moz/context', { context: 'chrome' });
    await session('POST', '/execute/sync', {
      script: `const t = gBrowser.addTab(arguments[0], {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      gBrowser.selectedTab = t;`,
      args: [POPUP_URL],
    });
    await session('POST', '/moz/context', { context: 'content' });
    await sleep(1000);
    const handles = await session('GET', '/window/handles');
    const popupHandle = handles.find((h) => !before.has(h));
    await session('POST', '/window', { handle: popupHandle ?? handles[handles.length - 1] });
    await sleep(500);
  }

  /** Runs inside the popup page: real runtime messaging to the real background. */
  const send = (message) =>
    execAsync(
      `const done = arguments[arguments.length - 1];
       browser.runtime.sendMessage(arguments[0]).then(
         (v) => done({ value: v === undefined ? null : v }),
         (e) => done({ thrown: String(e) }));`,
      [message],
    );

  return {
    sessionId,
    /** PIDs of the Firefox processes started with this profile, recorded right after start. */
    pids,
    session,
    execAsync,
    openPopup,
    send,
    installAddon: () => session('POST', '/moz/addon/install', { path: SRC, temporary: true }),
    uninstallAddon: () => session('POST', '/moz/addon/uninstall', { id: EXT_ID }),
    /** Quit Firefox through WebDriver (DELETE /session) and wait until the process is gone. */
    async close(timeoutMs = 30000) {
      await gecko.api('DELETE', `/session/${sessionId}`);
      const deadline = Date.now() + timeoutMs;
      let left = await pidsWithArg(profileDir);
      while (left.length && Date.now() < deadline) {
        await sleep(200);
        left = await pidsWithArg(profileDir);
      }
      return left;
    },
  };
}
