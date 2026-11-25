#!/usr/bin/env node
/**
 * Real-Firefox smoke test. Zero dependencies (Node 20+).
 *
 * Drives a headless Firefox through geckodriver (WebDriver HTTP API), installs `src/` as a
 * temporary add-on and exercises the popup and the real background over runtime messaging.
 * It never reaches the real x.com or twitter.com: the browser only talks to a local proxy that
 * serves a copy of dev/x-fixture.html (see local-x.mjs), plus moz-extension:// pages.
 *
 * Env: FIREFOX_BIN, GECKODRIVER_BIN (see scripts/e2e/README.md). Skips (exit 0) if either is missing.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROXY_MARKER, startLocalX } from './local-x.mjs';
import {
  EXT_ID,
  POPUP_URL,
  ROOT,
  createReporter,
  createSession,
  resolveBins,
  sleep,
  startGecko,
} from './lib.mjs';

const GOOD_URL = 'https://x.com/ada_builds/status/1234567890';

const bins = resolveBins();
if (!bins) process.exit(0);
const { firefoxBin, geckoBin } = bins;
const { check, finish } = createReporter();

async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), 'xmark-e2e-'));
  const gecko = await startGecko(geckoBin);
  let s = null;
  let localX = null;
  try {
    localX = await startLocalX(ROOT);
  } catch (err) {
    console.log(`SKIP local x.com content-script checks (needs openssl): ${err.message}`);
  }

  try {
    s = await createSession(gecko, {
      firefoxBin,
      profileDir,
      capabilities: localX
        ? {
            proxy: {
              proxyType: 'manual',
              httpProxy: `127.0.0.1:${localX.proxyPort}`,
              sslProxy: `127.0.0.1:${localX.proxyPort}`,
              noProxy: [],
            },
          }
        : {},
    });
    const { session, execAsync, send } = s;

    // (a) install + background alive (liveness is proven by the message round trip in (c))
    let installed = false;
    try {
      const id = await s.installAddon();
      installed = id === EXT_ID;
      check('(a) add-on installed as temporary add-on', installed, `id=${id}`);
    } catch (err) {
      check('(a) add-on installed as temporary add-on', false, err.message);
    }
    if (!installed) return;

    // WebDriver refuses to navigate to moz-extension:// URLs; lib.mjs opens the popup through
    // the chrome (parent process) context.
    await s.openPopup();

    // (b) popup renders
    const dom = await session('POST', '/execute/sync', {
      script: `return {
        title: document.title,
        text: document.body.innerText,
        tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()),
        url: location.href,
      };`,
      args: [],
    });
    check('(b) popup page loads at deterministic origin', dom.url === POPUP_URL, dom.url);
    check('(b) popup title is "xmark-manager"', dom.title === 'xmark-manager', dom.title);
    check(
      '(b) popup has Save and Saved tabs',
      dom.tabs.includes('Save') && dom.tabs.includes('Saved'),
      JSON.stringify(dom.tabs),
    );
    check(
      '(b) popup header text contains "xmark-manager"',
      /xmark-manager/i.test(dom.text),
      JSON.stringify(dom.text.slice(0, 60)),
    );

    // (c) round trip
    const saved = await send({ type: 'SAVE_POST', payload: { url: GOOD_URL } });
    check('(c) SAVE_POST canonical URL ok', saved.value?.ok === true, JSON.stringify(saved));
    const list = await send({ type: 'LIST_POSTS', payload: {} });
    const posts = Array.isArray(list.value?.data) ? list.value.data : [];
    check(
      '(c) LIST_POSTS returns the saved post',
      list.value?.ok === true && posts.some((p) => JSON.stringify(p).includes('1234567890')),
      `count=${posts.length}`,
    );
    const bad = await send({
      type: 'SAVE_POST',
      payload: { url: 'https://evil.example/ada/status/1' },
    });
    check(
      '(c) malformed URL rejected with InvalidPostUrlError',
      bad.value?.ok === false && bad.value?.error === 'InvalidPostUrlError',
      JSON.stringify(bad),
    );
    const badPayload = await send({ type: 'SAVE_POST', payload: 'nope' });
    check(
      '(c) non-object payload rejected with bad_payload',
      badPayload.value?.ok === false && badPayload.value?.error === 'bad_payload',
      JSON.stringify(badPayload),
    );

    // (d) message guard
    const unknown = await send({ type: 'DROP_TABLES' });
    check(
      '(d) unknown message type rejected',
      unknown.value?.ok === false && ['rejected', 'unknown_message'].includes(unknown.value?.error),
      JSON.stringify(unknown),
    );
    const notObj = await send('SAVE_POST');
    check(
      '(d) non-object message rejected',
      notObj.value?.ok === false && notObj.value?.error === 'rejected',
      JSON.stringify(notObj),
    );

    // (e) manifest facts as Firefox parsed them
    const manifest = await execAsync(
      `arguments[arguments.length - 1](browser.runtime.getManifest());`,
    );
    check('(e) manifest incognito is "not_allowed"', manifest.incognito === 'not_allowed');
    const perms = await execAsync(
      `browser.permissions.getAll().then(arguments[arguments.length - 1]);`,
    );
    const dcp = manifest.browser_specific_settings?.gecko?.data_collection_permissions;
    check(
      '(e) data_collection_permissions accepted (required: none)',
      JSON.stringify(dcp?.required) === JSON.stringify(['none']),
      `granted data_collection=${JSON.stringify(perms.data_collection)}`,
    );
    const allowed = await execAsync(
      `browser.extension.isAllowedIncognitoAccess().then(arguments[arguments.length - 1]);`,
    );
    check('(e) incognito access is not granted', allowed === false, String(allowed));

    // (f) console errors: only Firefox's own stderr (relayed by geckodriver) is reachable.
    const jsErrors = gecko
      .log()
      .split('\n')
      .filter((l) => /JavaScript error|moz-extension:\/\//.test(l) && /error/i.test(l));
    console.log(
      `INFO (f) extension errors visible on Firefox stderr: ${jsErrors.length} ` +
        '(the extension console itself is not reachable through classic WebDriver)',
    );
    for (const l of jsErrors.slice(0, 10)) console.log(`  ${l.slice(0, 200)}`);
    check('(f) no JavaScript errors reported on Firefox stderr', jsErrors.length === 0);
    // (g) content script on a LOCAL copy of the fixture served as https://x.com (never real X).
    if (localX) {
      // Safety gate: prove Firefox routes through the local proxy before opening any x.com URL.
      const popupHandle2 = await session('GET', '/window');
      const folder = await send({ type: 'CREATE_FOLDER', payload: { name: 'Reading' } });
      const readingId = folder.value?.data?.id;
      await session('POST', '/window/new', { type: 'tab' }).then((w) =>
        session('POST', '/window', { handle: w.handle }),
      );
      await session('POST', '/url', { url: 'http://xmark-proxy-check.test/' });
      const marker = await session('POST', '/execute/sync', {
        script: 'return document.body.innerText;',
        args: [],
      });
      const proxied = marker.includes(PROXY_MARKER);
      check('(g) Firefox routes http through the local proxy (safety gate)', proxied);
      if (proxied) {
        await session('POST', '/url', { url: 'https://x.com/home' });
        const xHandle = await session('GET', '/window');
        const page = await session('POST', '/execute/sync', {
          script: 'return { title: document.title, url: location.href };',
          args: [],
        });
        check(
          '(g) x.com resolves to the local fixture',
          page.title.includes('x fixture') && page.url === 'https://x.com/home',
          JSON.stringify(page),
        );
        const hostCount = async () =>
          session('POST', '/execute/sync', {
            script: `return document.querySelectorAll('[data-xmark-host]').length;`,
            args: [],
          });
        let hosts = 0;
        for (let i = 0; i < 40 && hosts < 3; i++) {
          hosts = await hostCount();
          if (hosts < 3) await sleep(250);
        }
        check(
          '(g) content script injected a Save host into each of the 3 posts',
          hosts === 3,
          `hosts=${hosts}`,
        );
        // The shadow root is closed, so nothing inside it is readable from here. Use real, trusted
        // input only: a pointer click on the host, then key presses (focus crosses shadow
        // boundaries), and assert the observable outcome through the real background.
        const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
        const host = await session('POST', '/element', {
          using: 'css selector',
          value: '[data-xmark-host]',
        });
        const rect = await session('GET', `/element/${host[ELEMENT_KEY]}/rect`);
        check(
          '(g) first Save host has a visible, non-zero rect',
          rect.width > 0 && rect.height > 0,
          JSON.stringify(rect),
        );
        await session('POST', '/actions', {
          actions: [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                { type: 'pointerMove', origin: { [ELEMENT_KEY]: host[ELEMENT_KEY] }, x: 0, y: 0 },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ],
        });
        await sleep(1500); // the panel opens after two background round trips and focuses Folder
        const panelFacts = await session('POST', '/execute/sync', {
          script: `const h = document.querySelector('[data-xmark-panel-host]');
            if (!h) return null;
            const cs = getComputedStyle(h);
            return { direct: h.parentNode === document.documentElement, inArticle: !!h.closest('article'),
              position: cs.position, z: cs.zIndex, closed: h.shadowRoot === null,
              count: document.querySelectorAll('[data-xmark-panel-host]').length };`,
          args: [],
        });
        check(
          '(g) the panel host is a direct child of the document root, fixed, z-index max, root closed',
          !!panelFacts &&
            panelFacts.direct &&
            !panelFacts.inArticle &&
            panelFacts.position === 'fixed' &&
            panelFacts.z === '2147483647' &&
            panelFacts.closed &&
            panelFacts.count === 1,
          JSON.stringify(panelFacts),
        );
        const KEYS = { down: '\uE015', tab: '\uE004', enter: '\uE007' };
        const press = (...seq) =>
          session('POST', '/actions', {
            actions: [
              {
                type: 'key',
                id: 'kb',
                actions: seq.flatMap((k) =>
                  [...(KEYS[k] ?? k)].flatMap((ch) => [
                    { type: 'keyDown', value: ch },
                    { type: 'keyUp', value: ch },
                  ]),
                ),
              },
            ],
          });
        // Folder (focused): type-ahead "R" picks "Reading"; Tab to Tags, Tab to Notes, Tab to Save, Enter.
        await press('R', 'tab', 'fixture, e2e', 'tab', 'typed by keys', 'tab', 'enter');

        await session('POST', '/window', { handle: popupHandle2 });
        let saved = null;
        for (let i = 0; i < 40 && !saved; i++) {
          const after = await send({ type: 'LIST_POSTS', payload: {} });
          const posts = Array.isArray(after.value?.data) ? after.value.data : [];
          saved = posts.find((p) => p.url === 'https://x.com/ada/status/1000000000000000001');
          if (!saved) await sleep(250);
        }
        check(
          '(g) the post saved from the x.com page (trusted click + keys) is listed via the real background',
          !!saved,
          saved ? '' : 'not listed after 10s',
        );
        check(
          '(g) saved post carries the typed folder, tags and notes',
          saved?.folder_id === readingId &&
            JSON.stringify(saved?.tags) === JSON.stringify(['fixture', 'e2e']) &&
            saved?.notes === 'typed by keys',
          `readingId=${readingId} saved=${JSON.stringify(saved)}`,
        );
        await session('POST', '/window', { handle: xHandle });
        // Second post: "A" picks "Add folder…"; settings open in a new tab and nothing is created.
        for (let i = 0; i < 40; i++) {
          const open = await session('POST', '/execute/sync', {
            script: `return !!document.querySelector('[data-xmark-panel-host]');`,
            args: [],
          });
          if (!open) break;
          await sleep(250);
        }
        const handlesBefore = await session('GET', '/window/handles');
        const hostEls = await session('POST', '/elements', {
          using: 'css selector',
          value: '[data-xmark-host]',
        });
        await session('POST', '/actions', {
          actions: [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                {
                  type: 'pointerMove',
                  origin: { [ELEMENT_KEY]: hostEls[1][ELEMENT_KEY] },
                  x: 0,
                  y: 0,
                },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ],
        });
        await sleep(1500);
        await press('A');
        let optionsUrl = null;
        for (let i = 0; i < 40 && !optionsUrl; i++) {
          const handles = await session('GET', '/window/handles');
          for (const h of handles.filter((h) => !handlesBefore.includes(h))) {
            await session('POST', '/window', { handle: h });
            const url = await session('GET', '/url');
            if (/^moz-extension:\/\/[^/]+\/options\/options\.html#folders-add$/.test(url)) {
              optionsUrl = url;
            }
          }
          if (!optionsUrl) await sleep(250);
        }
        check(
          '(g) choosing "Add folder…" by keyboard opens the options page on #folders-add in a new tab',
          !!optionsUrl,
          String(optionsUrl),
        );
        await session('POST', '/window', { handle: popupHandle2 });
        const fl = await send({ type: 'LIST_FOLDERS', payload: {} });
        const lp = await send({ type: 'LIST_POSTS', payload: {} });
        check(
          '(g) no folder and no second post was created by that choice',
          (fl.value?.data ?? []).length === 1 &&
            !(lp.value?.data ?? []).some((p) => p.url.endsWith('/1000000000000000002')),
          JSON.stringify({ fl: fl.value?.data, n: lp.value?.data?.length }),
        );
        // (h) Options > Saved lists what the flows above saved (the options page is a normal
        // extension page: open it in this extension tab and read its text).
        const popupUrl = await session('GET', '/url');
        const base = popupUrl.replace(/\/popup\/[^/]*$/, '');
        await session('POST', '/url', { url: `${base}/options/options.html#saved` });
        let savedText = '';
        for (let i = 0; i < 40 && !/\d+ posts?/.test(savedText); i++) {
          savedText = await session('POST', '/execute/sync', {
            script: `return document.querySelector('#section-saved')?.innerText ?? '';`,
            args: [],
          });
          if (!/\d+ posts?/.test(savedText)) await sleep(250);
        }
        const authors = [...new Set((lp.value?.data ?? []).map((p) => p.author).filter(Boolean))];
        check(
          '(h) the options #saved route renders the posts saved by the x.com flow',
          authors.length > 0 && authors.every((a) => savedText.includes(`@${a}`)),
          `authors=${authors.join(',')} text=${savedText.slice(0, 160)}`,
        );
      }
      console.log(
        `INFO (g) hosts Firefox asked the local proxy for (all absorbed locally, nothing forwarded): ${[...localX.hosts].join(', ')}`,
      );
    }
  } finally {
    if (s) {
      const left = await s.close().catch((err) => [`close failed: ${err.message}`]);
      check('Firefox quit cleanly, no leftover process', left.length === 0, left.join(','));
    }
    await gecko.stop();
    await localX?.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (err) {
  check('e2e run completed without harness error', false, err.message);
}
process.exit(finish());
