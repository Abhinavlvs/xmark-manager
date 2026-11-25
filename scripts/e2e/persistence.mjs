#!/usr/bin/env node
/**
 * Real-Firefox restart-persistence test. Zero dependencies (Node 20+).
 *
 * Saves a library through the real background, quits Firefox cleanly, relaunches on the SAME
 * throwaway profile directory and checks the data is still there. Also covers an uninstall + reinstall
 * inside one session and a corrupt library (quarantine) across a restart.
 *
 * The add-on is installed as a TEMPORARY add-on (the only unsigned install release Firefox
 * allows), so two prefs keep its storage and its moz-extension:// origin across the restart:
 * `extensions.webextensions.keepStorageOnUninstall` and `extensions.webextensions.keepUuidOnUninstall`
 * plus the pinned uuid map. See scripts/e2e/README.md for exactly what this proves and what it does not.
 *
 * Never touches x.com or the user's real profile. Env: FIREFOX_BIN, GECKODRIVER_BIN.
 */

import { deepStrictEqual } from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXT_UUID,
  createReporter,
  createSession,
  pidsWithArg,
  resolveBins,
  startGecko,
} from './lib.mjs';

const bins = resolveBins();
if (!bins) process.exit(0);

const { check, finish } = createReporter();

// XMARK_PERSIST_PREFS=none|storage|uuid|both (default both) is a diagnostic knob used to show which
// prefs matter; only the default is expected to pass.
const MODE = process.env.XMARK_PERSIST_PREFS || 'both';
const KEEP_PREFS = {
  'extensions.webextensions.keepStorageOnUninstall': MODE === 'both' || MODE === 'storage',
  'extensions.webextensions.keepUuidOnUninstall': MODE === 'both' || MODE === 'uuid',
};
const GARBAGE = '{"version":1,"folders":[ this is not json';

const tryEqual = (actual, expected) => {
  try {
    deepStrictEqual(actual, expected);
    return { ok: true, detail: '' };
  } catch (err) {
    return { ok: false, detail: String(err.message).split('\n').slice(0, 6).join(' | ') };
  }
};
const noExportedAt = (text) => {
  const doc = JSON.parse(text);
  delete doc.exported_at;
  return JSON.stringify(doc);
};

async function main() {
  const profileDir = mkdtempSync(join(tmpdir(), 'xmark-persist-'));
  const gecko = await startGecko(bins.geckoBin);

  const sessionPids = [];

  /**
   * One browser run on the shared profile: start, install, open the popup, run `fn`, quit.
   * Throws (aborting the whole run) if Firefox does not quit cleanly.
   */
  async function run(label, fn) {
    const s = await createSession(gecko, {
      firefoxBin: bins.firefoxBin,
      profileDir,
      prefs: KEEP_PREFS,
    });
    check(`${label}: Firefox started`, s.pids.length > 0, `pids=${s.pids.join(',')}`);
    const earlier = new Set(sessionPids.flat());
    check(
      `${label}: new Firefox process, none reused from an earlier session`,
      s.pids.length > 0 && s.pids.every((pid) => !earlier.has(pid)),
    );
    sessionPids.push(s.pids);
    let failure = null;
    try {
      const id = await s.installAddon();
      check(`${label}: add-on installed`, typeof id === 'string' && id.length > 0, `id=${id}`);
      await s.openPopup();
      await fn(s);
    } catch (err) {
      failure = err;
    }
    let left;
    try {
      left = await s.close();
    } catch (err) {
      left = [`close failed: ${err.message}`];
    }
    check(`${label}: Firefox quit cleanly, no leftover process`, left.length === 0, left.join(','));
    if (left.length) throw new Error(`${label}: Firefox did not quit cleanly; aborting`);
    if (failure) throw failure;
  }

  const call = async (s, type, payload) => {
    const r = await s.send({ type, payload });
    if (r.value?.ok !== true) throw new Error(`${type} failed: ${JSON.stringify(r)}`);
    return r.value.data;
  };
  const callRaw = async (s, type, payload) => (await s.send({ type, payload })).value;
  const snapshot = async (s) => ({
    posts: await call(s, 'LIST_POSTS', {}),
    folders: await call(s, 'LIST_FOLDERS'),
    settings: await call(s, 'GET_SETTINGS'),
  });

  try {
    let expected = null; // what session A wrote
    let exportA = null;

    // (1) Session A: write a library.
    await run('(1) session A', async (s) => {
      await call(s, 'SET_SETTINGS', { saveSnippets: true });
      const reading = await call(s, 'CREATE_FOLDER', { name: 'Reading' });
      const tools = await call(s, 'CREATE_FOLDER', { name: 'Tools' });
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
      for (const p of saves) ids.push((await call(s, 'SAVE_POST', p)).id);
      await call(s, 'DELETE_POST', { id: ids[3] });
      expected = await snapshot(s);
      exportA = await call(s, 'EXPORT_DATA');
      const doc = JSON.parse(exportA);
      check(
        '(1) library written: 3 live posts, 2 folders, snippet on',
        expected.posts.length === 3 &&
          expected.folders.length === 2 &&
          expected.settings.saveSnippets === true,
        `posts=${expected.posts.length} folders=${expected.folders.length}`,
      );
      check(
        '(1) export holds the deleted post as a tombstone',
        doc.posts.some((p) => p.deleted === true) && doc.posts.length === 4,
        `exported posts=${doc.posts.length}`,
      );
      check(
        '(1) a snippet was stored while the setting was on',
        expected.posts.find((p) => p.url.endsWith('/1000000000000000001'))?.text_preview ===
          'A short snippet',
        '',
      );
    });

    const storageRoot = join(profileDir, 'storage', 'default');
    const storageDirs = existsSync(storageRoot)
      ? readdirSync(storageRoot).filter((d) => d.startsWith(`moz-extension+++${EXT_UUID}`))
      : [];
    check(
      '(2) extension storage (idb) is on disk in the profile after quit',
      storageDirs.length === 1 && existsSync(join(storageRoot, storageDirs[0], 'idb')),
      storageDirs.join(','),
    );

    // (3) Session B: same profile; the data must be back. Then (5) uninstall + reinstall.
    await run('(3) session B', async (s) => {
      const got = await snapshot(s);
      const eq = tryEqual(got, expected);
      check(
        '(3) LIST_POSTS, LIST_FOLDERS, GET_SETTINGS equal what session A wrote',
        eq.ok,
        eq.detail,
      );
      check(
        '(3) the deleted post is not listed',
        !got.posts.some((p) => p.url?.includes('1000000000000000004')),
      );
      const exportB = await call(s, 'EXPORT_DATA');
      check(
        '(3) EXPORT_DATA equals session A (ignoring exported_at)',
        noExportedAt(exportB) === noExportedAt(exportA),
        '',
      );
      check(
        '(3) the tombstone is still in a fresh export',
        JSON.parse(exportB).posts.some((p) => p.deleted === true),
      );

      // (5) uninstall + reinstall at the same uuid inside one session (NOT the about:debugging Reload).
      await s.uninstallAddon();
      const id = await s.installAddon();
      check(
        '(5) add-on uninstalled and reinstalled in the same session',
        typeof id === 'string' && id.length > 0,
        `id=${id}`,
      );
      await s.openPopup();
      const after = await snapshot(s);
      const eq2 = tryEqual(after, expected);
      check('(5) library unchanged after uninstall + reinstall', eq2.ok, eq2.detail);
      const exportR = await call(s, 'EXPORT_DATA');
      check(
        '(5) EXPORT_DATA unchanged after uninstall + reinstall',
        noExportedAt(exportR) === noExportedAt(exportA),
      );
    });

    // (4) Session C: still the same data after a second restart; then corrupt the library.
    await run('(4) session C', async (s) => {
      const eq = tryEqual(await snapshot(s), expected);
      check('(4) library intact after a second restart', eq.ok, eq.detail);
      const wrote = await s.execAsync(
        `const done = arguments[arguments.length - 1];
         browser.storage.local.set({ 'xmark.doc': arguments[0] }).then(() => done('ok'), (e) => done(String(e)));`,
        [GARBAGE],
      );
      check(
        '(4) garbage written to xmark.doc through the extension page',
        wrote === 'ok',
        String(wrote),
      );
    });

    // Session D: restart on the corrupt library.
    await run('(4) session D', async (s) => {
      const status = await call(s, 'GET_STORAGE_STATUS');
      check(
        '(4) GET_STORAGE_STATUS reports quarantined',
        status?.state === 'quarantined',
        JSON.stringify(status),
      );
      const copy = await call(s, 'EXPORT_QUARANTINE');
      check(
        '(4) EXPORT_QUARANTINE returns the garbage text byte for byte',
        copy === GARBAGE,
        JSON.stringify(copy)?.slice(0, 80),
      );
      const posts = await call(s, 'LIST_POSTS', {});
      check(
        '(4) LIST_POSTS is empty on the unreadable library',
        Array.isArray(posts) && posts.length === 0,
        `count=${posts?.length}`,
      );
      const saved = await callRaw(s, 'SAVE_POST', {
        url: 'https://x.com/after/status/2000000000000000001',
        notes: 'after corruption',
      });
      check('(4) a new save works', saved?.ok === true, JSON.stringify(saved));
      const copy2 = await call(s, 'EXPORT_QUARANTINE');
      check('(4) the unreadable copy survives the new save', copy2 === GARBAGE);
      const status2 = await call(s, 'GET_STORAGE_STATUS');
      check(
        '(4) status stays quarantined after the save',
        status2?.state === 'quarantined',
        JSON.stringify(status2),
      );
    });

    // Session E: the new save and the copy both survive one more restart.
    await run('(4) session E', async (s) => {
      const posts = await call(s, 'LIST_POSTS', {});
      check(
        '(4) the post saved after corruption survives a restart',
        posts.length === 1 && posts[0].url === 'https://x.com/after/status/2000000000000000001',
        `count=${posts.length}`,
      );
      check(
        '(4) the unreadable copy survives a restart',
        (await call(s, 'EXPORT_QUARANTINE')) === GARBAGE,
      );
    });
  } finally {
    for (const pid of await pidsWithArg(profileDir)) {
      try {
        process.kill(pid, 'SIGKILL'); // only processes started with our throwaway profile
      } catch {
        // already gone
      }
    }
    await gecko.stop();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (err) {
  check('persistence run completed without harness error', false, err.message);
}
process.exit(finish());
