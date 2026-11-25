#!/usr/bin/env node
/**
 * npm run safari:convert
 * Builds dist/safari (clean rebuild), then runs Apple's converter into <repo>/safari/ (git-ignored,
 * generated). Writes only dist/safari and safari/; never launches Safari or Xcode (--no-open
 * --no-prompt). Set XMARK_BUNDLE_ID to override the placeholder bundle identifier.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildBundles } from '../build.mjs';
import {
  APP_NAME,
  ROOT,
  assertInsideSafari,
  converterArgs,
  findConverter,
  resolveBundleId,
} from './common.mjs';

/** `deps` lets tests inject fakes: {findConverter, build, spawn, log}. */
export async function convert({ root = ROOT, env = process.env, deps = {} } = {}) {
  const find = deps.findConverter ?? findConverter;
  const buildFn = deps.build ?? buildBundles;
  const spawn = deps.spawn ?? spawnSync;
  const log = deps.log ?? console.log;
  // Validate first so a bad XMARK_BUNDLE_ID is never silently ignored on a machine without Xcode.
  const bundleId = resolveBundleId(env);
  const tool = find();
  if (!tool) {
    log('SKIP: Xcode command line tools (xcrun safari-web-extension-packager) not found.');
    return { skipped: true };
  }
  const projectLocation = assertInsideSafari(root, 'safari');
  // The packager (with --force) replaces safari/<app name>, so confine that path too.
  assertInsideSafari(root, join('safari', APP_NAME));
  const [bundleDir] = await buildFn({ root, browsers: ['safari'] });
  log(`built ${bundleDir}`);
  log(`running xcrun ${tool} (bundle id ${bundleId}, output ${projectLocation})`);
  const args = converterArgs({ bundleDir, projectLocation, appName: APP_NAME, bundleId });
  const r = spawn('xcrun', [tool, ...args], { encoding: 'utf8' });
  if (r.stdout) log(r.stdout);
  if (r.stderr) log(r.stderr);
  if (r.status !== 0) throw new Error(`${tool} exited with ${r.status}`);
  const project = join(projectLocation, APP_NAME, `${APP_NAME}.xcodeproj`);
  log(`Xcode project: ${project}`);
  return { skipped: false, project };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  convert().catch((e) => {
    console.error(`safari:convert failed: ${e.message}`);
    process.exit(1);
  });
}
