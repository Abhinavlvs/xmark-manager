#!/usr/bin/env node
/**
 * Release verification + packaging, identical locally and in CI (.github/workflows/release.yml).
 *
 *   node scripts/release-dry-run.mjs [--tag vX.Y.Z | --version X.Y.Z] [--check-only] [--dry-run] [--out dist/release]
 *
 * Steps: version consistency (package.json, src/manifest.json, every built bundle, tag), changelog
 * section, build all bundles, zip them, SHA256SUMS, release-manifest.json, RELEASE_NOTES.md.
 * Writes only under dist/. No network, never writes to git. It reads `git` (read-only) for the
 * commit and the source date when GITHUB_SHA / SOURCE_DATE_EPOCH are unset.
 * `--dry-run` (local rehearsal, `npm run release:dry-run`) tolerates a placeholder changelog date such
 * as `TODO(release date)`; the release workflow does not pass it, so a real release needs a real date.
 * `--check-only` stops after the checks and the build (no zips or checksums).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, prepareOutDir } from './build.mjs';
import { BROWSERS } from './manifest-transform.mjs';
import { packageAll } from './package.mjs';
import {
  buildReleaseManifest,
  changelogHeadingDate,
  extractChangelogSection,
  isIsoDate,
  formatSha256Sums,
  isoFromEpoch,
  versionFromTag,
  versionMismatches,
} from './release-lib.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha256Of = (buf) => createHash('sha256').update(buf).digest('hex');

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * @param {{root?: string, tag?: string, version?: string, checkOnly?: boolean, out?: string,
 *   env?: Record<string, string|undefined>, log?: (s: string) => void}} [options]
 */
export async function releaseDryRun({
  root = DEFAULT_ROOT,
  tag,
  version: versionArg,
  checkOnly = false,
  dryRun = false,
  out = 'dist/release',
  env = process.env,
  log = console.log,
} = {}) {
  const pkg = await readJson(join(root, 'package.json'));
  const srcManifest = await readJson(join(root, 'src/manifest.json'));
  const expected = tag ? versionFromTag(tag) : (versionArg ?? pkg.version);
  if (tag && versionArg && versionArg !== expected) {
    throw new Error(`--version ${versionArg} does not match tag ${tag}`);
  }

  const found = { 'package.json': pkg.version, 'src/manifest.json': srcManifest.version };
  let problems = versionMismatches(expected, found);

  const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  const notes = extractChangelogSection(changelog, expected);
  if (notes === null) problems.push(`CHANGELOG.md has no non-empty "## [${expected}]" section`);

  const date = changelogHeadingDate(changelog, expected);
  if (notes !== null && !isIsoDate(date)) {
    // A placeholder such as TODO(release date) is tolerated only when rehearsing locally.
    const msg = `CHANGELOG.md heading for ${expected} has no YYYY-MM-DD date (found: ${date ?? 'none'})`;
    if (dryRun) log(`warning: ${msg}`);
    else problems.push(msg);
  }

  log(`building bundles for ${expected}`);
  await build({ root, browsers: BROWSERS });
  const bundleVersions = {};
  for (const b of BROWSERS) {
    const m = await readJson(join(root, 'dist', b, 'manifest.json'));
    bundleVersions[`dist/${b}/manifest.json`] = m.version;
  }
  problems = problems.concat(versionMismatches(expected, bundleVersions));
  if (problems.length > 0) {
    throw new Error(`release checks failed:\n- ${problems.join('\n- ')}`);
  }
  log('version and changelog checks passed');
  if (checkOnly) return { version: expected, checkOnly: true };

  const outDir = resolve(root, out);
  await prepareOutDir(root, out);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const zips = await packageAll({ root });
  const files = [];
  for (const zip of zips) {
    const name = zip.split(/[\\/]/).pop();
    const browser = BROWSERS.find((b) => name.endsWith(`-${b}.zip`));
    const dest = join(outDir, name);
    await copyFile(zip, dest);
    const data = await readFile(dest);
    files.push({ name, size: (await stat(dest)).size, sha256: sha256Of(data), browser });
  }

  await writeFile(join(outDir, 'SHA256SUMS'), formatSha256Sums(files));
  const commit = env.GITHUB_SHA || git(root, ['rev-parse', 'HEAD']) || 'unknown';
  const sourceDate = isoFromEpoch(
    env.SOURCE_DATE_EPOCH ?? git(root, ['log', '-1', '--format=%ct']),
  );
  const manifest = buildReleaseManifest({
    name: pkg.name,
    version: expected,
    tag: tag ?? null,
    commit,
    sourceDate,
    files,
  });
  await writeFile(join(outDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outDir, 'RELEASE_NOTES.md'), `${notes}\n`);

  const written = (await readdir(outDir)).sort();
  log(`wrote ${out}/: ${written.join(', ')}`);
  return { version: expected, outDir, files: written, manifest };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') opts.tag = argv[++i];
    else if (a === '--version') opts.version = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--check-only') opts.checkOnly = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await releaseDryRun(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
