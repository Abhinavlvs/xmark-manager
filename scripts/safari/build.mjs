#!/usr/bin/env node
/**
 * npm run safari:build
 * Compiles the generated Xcode project (run `npm run safari:convert` first) with xcodebuild:
 * Debug configuration, no code signing, derived data in a fresh temp directory. Nothing is
 * installed and Safari is never launched. The scripts write nothing outside the repo and the temp
 * directory; xcodebuild itself may write caches and logs under ~/Library (UNVERIFIED).
 * The derived-data directory is removed after a failed build; after a success it is kept (it holds
 * the .app) and the cleanup command is printed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME, ROOT, checkXcodebuild, xcodebuildArgs } from './common.mjs';

/** `deps` lets tests inject fakes: {check, spawn, log, makeTemp, remove}. */
export function buildApp({ root = ROOT, deps = {} } = {}) {
  const check = deps.check ?? checkXcodebuild;
  const spawn = deps.spawn ?? spawnSync;
  const log = deps.log ?? console.log;
  const makeTemp = deps.makeTemp ?? (() => mkdtempSync(join(tmpdir(), 'xmark-safari-dd-')));
  const remove = deps.remove ?? ((dir) => rmSync(dir, { recursive: true, force: true }));
  const xcode = check();
  if (!xcode.ok) {
    log(`SKIP: ${xcode.reason}.`);
    return { skipped: true, reason: xcode.reason };
  }
  const project = join(root, 'safari', APP_NAME, `${APP_NAME}.xcodeproj`);
  if (!existsSync(project)) {
    throw new Error(`no Xcode project at ${project}; run npm run safari:convert first`);
  }
  const derivedData = makeTemp();
  log(`xcodebuild (unsigned, Debug), derived data: ${derivedData}`);
  try {
    const args = xcodebuildArgs({ project, scheme: APP_NAME, derivedData });
    const r = spawn('xcrun', ['xcodebuild', ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').slice(-40).join('\n');
    log(tail);
    if (r.status !== 0) throw new Error(`xcodebuild failed (exit ${r.status}); log tail above`);
    const products = join(derivedData, 'Build', 'Products', 'Debug');
    const app = readdirSync(products).find((n) => n.endsWith('.app'));
    if (!app) throw new Error(`build succeeded but no .app found in ${products}`);
    log(`BUILD SUCCEEDED: ${join(products, app)}`);
    log(`Clean up when done: rm -rf "${derivedData}"`);
    return { skipped: false, app: join(products, app), derivedData };
  } catch (e) {
    remove(derivedData);
    throw e;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    buildApp();
  } catch (e) {
    console.error(`safari:build failed: ${e.message}`);
    process.exit(1);
  }
}
