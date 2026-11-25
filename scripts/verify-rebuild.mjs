#!/usr/bin/env node
/**
 * Reproducible-build check used by the deploy workflows when attestations are not available
 * (`verify = rebuild`). Run it in a checkout of the release tag:
 *
 *   node scripts/verify-rebuild.mjs --tag vX.Y.Z --dir <folder with the downloaded release files>
 *
 * It rebuilds the release from this checkout (same code path as release.yml) into
 * dist/rebuild/, hashes every downloaded zip itself (SHA256SUMS is not trusted) and requires the
 * names and sha256 of the zips, and the text of SHA256SUMS, to equal the rebuild. Any difference
 * exits non-zero. UNCONFIRMED: byte-identical output across Node versions or operating systems;
 * use the Node version pinned in .nvmrc (release.yml uses the same file).
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseDryRun } from './release-dry-run.mjs';
import { checksumDifferences, formatSha256Sums } from './release-lib.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * @param {{root?: string, tag: string, dir: string, out?: string, env?: Record<string,string|undefined>,
 *   log?: (s: string) => void}} options
 * @returns {Promise<{checked: string[]}>} throws when anything differs
 */
export async function verifyRebuild({
  root = DEFAULT_ROOT,
  tag,
  dir,
  out = 'dist/rebuild',
  env = process.env,
  log = console.log,
}) {
  if (!tag || !dir) throw new Error('--tag and --dir are required');
  await releaseDryRun({ root, tag, out, env, log });
  const rebuiltDir = resolve(root, out);
  const sha = async (file) =>
    createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  const zips = async (d) =>
    Promise.all(
      (await readdir(d))
        .filter((n) => n.endsWith('.zip'))
        .sort()
        .map(async (name) => ({ name, sha256: await sha(join(d, name)) })),
    );
  const downloaded = await zips(dir);
  if (downloaded.length === 0) throw new Error(`no zip files in ${dir}`);
  const problems = checksumDifferences(downloaded, await zips(rebuiltDir));
  const sums = await readFile(join(dir, 'SHA256SUMS'), 'utf8');
  if (sums !== formatSha256Sums(downloaded)) {
    problems.push('SHA256SUMS does not match the downloaded zips');
  }
  if (problems.length > 0) {
    throw new Error(`rebuild does not match the release:\n- ${problems.join('\n- ')}`);
  }
  log(`rebuild matches the release: ${downloaded.map((d) => d.name).join(', ')}`);
  return { checked: downloaded.map((d) => d.name) };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tag') opts.tag = argv[++i];
    else if (argv[i] === '--dir') opts.dir = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyRebuild(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
