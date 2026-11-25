#!/usr/bin/env node
/**
 * node scripts/package.mjs
 * Builds every bundle, then zips each into dist/zips/xmark-manager-<version>-<browser>.zip.
 * Safe to run repeatedly: bundles and zips are rewritten from scratch.
 */

import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, prepareOutDir } from './build.mjs';
import { BROWSERS } from './manifest-transform.mjs';
import { zipDirectory } from './zip.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** @returns {Promise<string[]>} the zip files written */
export async function packageAll({ root = DEFAULT_ROOT } = {}) {
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const dist = await prepareOutDir(root);
  const zipsDir = join(dist, 'zips');
  await rm(zipsDir, { recursive: true, force: true });
  await mkdir(zipsDir, { recursive: true });
  await build({ root, browsers: BROWSERS });
  const zips = [];
  for (const browser of BROWSERS) {
    const zip = join(zipsDir, `xmark-manager-${version}-${browser}.zip`);
    await zipDirectory(join(dist, browser), zip);
    zips.push(zip);
  }
  return zips;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const zip of await packageAll()) console.log(`wrote ${relative(process.cwd(), zip)}`);
}
