#!/usr/bin/env node
/**
 * Real-Chromium restart-persistence test. Zero dependencies (Node 20 with --experimental-websocket, or 22+).
 *
 * Saves a library through the real service worker, quits Chrome cleanly (Browser.close), relaunches on the
 * SAME throwaway profile and checks that library, folders, settings, tombstones and quarantine copies are
 * still there. Mirrors scripts/e2e/persistence.mjs (Firefox). No network: see chromium-lib.mjs.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createReporter, pidsWithArg } from './lib.mjs';
import {
  buildChrome,
  idFromWorker,
  launchChrome,
  makeProfileDir,
  readManifest,
  removeDir,
  resolveChrome,
  until,
  startLocalX,
} from './chromium-lib.mjs';
import {
  call,
  exportCopy,
  noExportedAt,
  setRaw,
  snapshot,
  tryEqual,
} from './chromium-checks/persistence-helpers.mjs';

const bin = resolveChrome();
if (!bin) process.exit(0);

const { check, finish } = createReporter();
const GARBAGE_1 = '{"version":1,"folders":[ this is not json';
const GARBAGE_2 = 'second unreadable value';

async function main() {
  buildChrome();
  const swFile = readManifest().background.service_worker;
  const profileDir = makeProfileDir('xmark-chrome-persist-');
  const localX = await startLocalX(); // keeps the host-resolver rules identical to the smoke test
  const pids = [];
  let extId = null;

  /** One browser run on the shared profile: launch, open the popup page, run `fn`, quit cleanly. */
  async function run(label, fn) {
    const browser = await launchChrome({
      bin,
      profileDir,
      localX,
      // This script only ever opens the extension's own pages; any other URL is refused.
      allowUrl: (url) => url.startsWith('chrome-extension://'),
    });
    check(`${label}: Chrome started`, browser.pid > 0, `pid=${browser.pid}`);
    check(
      `${label}: a new Chrome process, none reused from an earlier run`,
      !pids.includes(browser.pid),
    );
    pids.push(browser.pid);
    let failure = null;
    try {
      const worker = await browser.findWorker(swFile);
      if (!worker) throw new Error('our service worker did not start');
      const id = idFromWorker(worker);
      if (extId === null) extId = id;
      check(`${label}: same extension id as the first run`, id === extId, id);
      const popup = await browser.openPage(`chrome-extension://${id}/popup/popup.html`);
      const ready = await until(() =>
        popup
          .eval(`location.protocol === 'chrome-extension:' && !!chrome.runtime?.sendMessage`)
          .catch(() => false),
      );
      if (!ready) throw new Error('the popup page did not become an extension page');
      const send = (type, payload) => browser.sendMessage(popup, { type, payload });
      await fn({ browser, popup, send, id });
    } catch (err) {
      failure = err;
    }
    const clean = await browser.quit();
    const left = await pidsWithArg(profileDir);
    check(`${label}: Chrome quit cleanly (Browser.close)`, clean, '');
    check(`${label}: no process left on the profile`, left.length === 0, left.join(','));
    browser.kill();
    if (left.length) throw new Error(`${label}: Chrome did not quit; aborting`);
    if (failure) throw failure;
  }

  try {
    let expected = null;
    let exportA = null;

    await run('(1) run A', async ({ send }) => {
      await call(send, 'SET_SETTINGS', { saveSnippets: true });
      const reading = await call(send, 'CREATE_FOLDER', { name: 'Reading' });
      const tools = await call(send, 'CREATE_FOLDER', { name: 'Tools' });
      const saves = [
        {
          url: 'https://x.com/ada_builds/status/1000000000000000001',
          folderId: reading.id,
          tags: ['rust', 'perf'],
          notes: 'first note',
          textPreview: 'A short snippet',
        },
        {
          url: 'https://x.com/grace/status/1000000000000000002',
          folderId: tools.id,
          tags: ['cli'],
          notes: 'second note',
        },
        {
          url: 'https://x.com/linus/status/1000000000000000003',
          folderId: reading.id,
          tags: [],
          notes: '',
        },
        {
          url: 'https://x.com/doomed/status/1000000000000000004',
          folderId: tools.id,
          tags: ['gone'],
        },
      ];
      const ids = [];
      for (const p of saves) ids.push((await call(send, 'SAVE_POST', p)).id);
      await call(send, 'DELETE_POST', { id: ids[3] });
      expected = await snapshot(send);
      exportA = await call(send, 'EXPORT_DATA');
      const doc = JSON.parse(exportA);
      check(
        '(1) library written: 3 live posts, 2 folders, snippets on',
        expected.posts.length === 3 &&
          expected.folders.length === 2 &&
          expected.settings.saveSnippets === true,
        `posts=${expected.posts.length} folders=${expected.folders.length}`,
      );
      check(
        '(1) export holds the deleted post as a tombstone',
        doc.posts.length === 4 && doc.posts.some((p) => p.deleted === true),
        `exported posts=${doc.posts.length}`,
      );
      check(
        '(1) a snippet was stored while the setting was on',
        expected.posts.find((p) => p.url.endsWith('/1000000000000000001'))?.text_preview ===
          'A short snippet',
      );
    });

    check(
      '(2) extension storage is on disk in the profile after quit',
      existsSync(join(profileDir, 'Default', 'Local Extension Settings', extId)),
      join('Default', 'Local Extension Settings', extId),
    );

    await run('(3) run B', async ({ send }) => {
      const got = await snapshot(send);
      const eq = tryEqual(got, expected);
      check('(3) LIST_POSTS, LIST_FOLDERS, GET_SETTINGS equal what run A wrote', eq.ok, eq.detail);
      check(
        '(3) the deleted post is not listed',
        !got.posts.some((p) => p.url?.includes('1000000000000000004')),
      );
      const exportB = await call(send, 'EXPORT_DATA');
      check(
        '(3) EXPORT_DATA equals run A (ignoring exported_at)',
        noExportedAt(exportB) === noExportedAt(exportA),
      );
      check(
        '(3) the tombstone is still in a fresh export',
        JSON.parse(exportB).posts.some((p) => p.deleted === true),
      );
    });

    await run('(4) run C', async ({ send, popup }) => {
      const eq = tryEqual(await snapshot(send), expected);
      check('(4) library intact after a second restart', eq.ok, eq.detail);
      const wrote = await setRaw(popup, GARBAGE_1);
      check('(4) garbage written to xmark.doc through the extension page', wrote === 'ok', wrote);
    });

    await run('(4) run D', async ({ send, popup }) => {
      const status = await call(send, 'GET_STORAGE_STATUS');
      check(
        '(4) GET_STORAGE_STATUS reports quarantined with one copy after restart',
        status?.state === 'quarantined' && status.copies?.length === 1,
        JSON.stringify(status)?.slice(0, 160),
      );
      const copy = await exportCopy(send, status.copies[0]);
      check(
        '(4) the copy is the garbage byte for byte',
        copy === GARBAGE_1,
        JSON.stringify(copy)?.slice(0, 80),
      );
      const posts = await call(send, 'LIST_POSTS', {});
      check(
        '(4) LIST_POSTS is empty on the unreadable library',
        posts.length === 0,
        `count=${posts.length}`,
      );
      const saved = (
        await send('SAVE_POST', {
          url: 'https://x.com/after/status/2000000000000000001',
          notes: 'after corruption',
        })
      ).value;
      check('(4) a new save works', saved?.ok === true, JSON.stringify(saved));
      check(
        '(4) the copy survives the new save',
        (await exportCopy(send, status.copies[0])) === GARBAGE_1,
      );
      // a second, different unreadable value gets its own copy
      const wrote = await setRaw(popup, GARBAGE_2);
      check('(4) a second garbage value written', wrote === 'ok', wrote);
    });

    await run('(4) run E', async ({ send }) => {
      const status = await call(send, 'GET_STORAGE_STATUS');
      check(
        '(4) both unreadable copies are listed after another restart',
        status?.state === 'quarantined' && status.copies?.length === 2,
        JSON.stringify(status?.copies?.map((c) => c.n)),
      );
      const texts = [];
      for (const c of status.copies) texts.push(await exportCopy(send, c));
      check(
        '(4) both copies are intact byte for byte',
        texts.includes(GARBAGE_1) && texts.includes(GARBAGE_2),
        JSON.stringify(texts).slice(0, 120),
      );
      const posts = await call(send, 'LIST_POSTS', {});
      check('(4) the second unreadable value left an empty library', posts.length === 0);
      const saved = (
        await send('SAVE_POST', { url: 'https://x.com/again/status/2000000000000000002' })
      ).value;
      check(
        '(4) a save after the second corruption works',
        saved?.ok === true,
        JSON.stringify(saved),
      );
    });

    await run('(4) run F', async ({ send }) => {
      const posts = await call(send, 'LIST_POSTS', {});
      check(
        '(4) the post saved after corruption survives a restart',
        posts.length === 1 && posts[0].url === 'https://x.com/again/status/2000000000000000002',
        `count=${posts.length}`,
      );
      const status = await call(send, 'GET_STORAGE_STATUS');
      check('(4) both copies survive a further restart', status?.copies?.length === 2);
    });
  } finally {
    for (const pid of await pidsWithArg(profileDir)) {
      try {
        process.kill(pid, 'SIGKILL'); // only processes started with our throwaway profile
      } catch {
        // already gone
      }
    }
    await localX.close();
    removeDir(profileDir);
  }
}

try {
  await main();
} catch (err) {
  check('persistence run completed without harness error', false, err.stack ?? err.message);
}
process.exit(finish());
