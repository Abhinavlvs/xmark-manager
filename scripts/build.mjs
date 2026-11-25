#!/usr/bin/env node
/**
 * Zero-dependency bundle builder.
 *   node scripts/build.mjs [firefox|chrome|safari|all]
 * Writes dist/<browser>/ from src/ plus a per-browser manifest (rules in manifest-transform.mjs).
 * Every build starts from a clean dist/<browser>/ and refuses to write outside dist/.
 */

import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, bundleIcons, transformManifest } from './manifest-transform.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Walks `dir`; yields {path, dirent} for every entry (symlinks are reported, never followed). */
async function* walk(dir) {
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, dirent.name);
    yield { path, dirent };
    if (dirent.isDirectory()) yield* walk(path);
  }
}

/** All regular files under `dir` as sorted POSIX-style relative paths (no Node >= 20.12 APIs). */
export async function listFiles(dir) {
  const out = [];
  for await (const { path, dirent } of walk(dir)) {
    if (dirent.isFile()) out.push(relative(dir, path).split(sep).join('/'));
  }
  return out.sort();
}

async function assertNoSymlinks(dir) {
  for await (const { path, dirent } of walk(dir)) {
    if (dirent.isSymbolicLink())
      throw new Error(`refusing to build: symlink in source tree: ${path}`);
  }
}

const isInside = (parent, child) => child === parent || child.startsWith(parent + sep);

/** Paths a manifest points at; each must exist in the bundle. */
function manifestRefs(m) {
  const icon = m.action.default_icon;
  return [
    m.action.default_popup,
    m.options_ui?.page,
    ...Object.values(m.icons ?? {}),
    ...(typeof icon === 'string' ? [icon] : Object.values(icon ?? {})),
    ...(m.action.theme_icons ?? []).flatMap((t) => [t.light, t.dark]),
    ...m.content_scripts.flatMap((c) => c.js),
    m.background.service_worker,
    ...(m.background.scripts ?? []),
  ].filter(Boolean);
}

async function buildOne({ root, outDir, browser, source }) {
  const target = join(outDir, browser);
  if ((await lstat(target).catch(() => null))?.isSymbolicLink()) {
    throw new Error(`refusing to write: ${target} is a symlink pointing outside dist/`);
  }
  await rm(target, { recursive: true, force: true });
  const skip = (name) => name === '.DS_Store' || name.endsWith('.test.js');
  await cp(join(root, 'src'), target, {
    recursive: true,
    filter: (from) => !skip(from.split(sep).pop()),
  });
  const manifest = transformManifest(source, browser);
  if (browser !== 'firefox') {
    // PNG bundles replace the SVG icons that only Firefox uses.
    await rm(join(target, 'icons'), { recursive: true, force: true });
    await mkdir(join(target, 'icons'), { recursive: true });
    for (const { from, bundle } of bundleIcons(browser)) {
      if ((await lstat(join(root, 'assets/branding/export', from))).isSymbolicLink()) {
        throw new Error(`refusing to build: icon source is a symlink: ${from}`);
      }
      await cp(join(root, 'assets/branding/export', from), join(target, bundle));
    }
  }
  for (const ref of manifestRefs(manifest)) {
    const ok = await stat(join(target, ref)).then(
      (s) => s.isFile(),
      () => false,
    );
    if (!ok) throw new Error(`${browser}: manifest references missing file ${ref}`);
  }
  await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

/**
 * @param {{root?: string, browsers?: string[], outDir?: string}} [options]
 * @returns {Promise<string[]>} the bundle directories written
 */
/**
 * Validates and creates the output directory; returns its real path.
 * Everything is checked on real paths so a symlinked dist/ cannot redirect rm or writes elsewhere.
 */
export async function prepareOutDir(root, outDir) {
  const lexicalDist = resolve(root, 'dist');
  const out = resolve(root, outDir ?? 'dist');
  if (!isInside(lexicalDist, out)) throw new Error(`refusing to write outside dist/: ${out}`);
  const realRoot = await realpath(root);
  const expectedDist = join(realRoot, 'dist');
  const distStat = await lstat(lexicalDist).catch(() => null);
  if (distStat?.isSymbolicLink()) throw new Error('refusing to write: dist/ is a symlink');
  if (distStat && (await realpath(lexicalDist)) !== expectedDist) {
    throw new Error(
      'refusing to write: dist/ does not resolve to <repo>/dist (outside the repo layout)',
    );
  }
  // Nothing is created yet: the nearest existing ancestor of the target must already be inside dist/.
  let probe = out;
  while (!(await lstat(probe).catch(() => null))) probe = dirname(probe);
  const realProbe = await realpath(probe);
  if (!isInside(expectedDist, realProbe) && realProbe !== realRoot) {
    throw new Error(`refusing to write outside dist/: ${realProbe}`);
  }
  await mkdir(out, { recursive: true });
  const realOut = await realpath(out);
  if (!isInside(expectedDist, realOut))
    throw new Error(`refusing to write outside dist/: ${realOut}`);
  return realOut;
}

export async function build({ root = DEFAULT_ROOT, browsers = BROWSERS, outDir } = {}) {
  for (const b of browsers) {
    if (!BROWSERS.includes(b)) throw new Error(`unknown browser: ${b}`);
  }
  const out = await prepareOutDir(root, outDir);
  await assertNoSymlinks(join(root, 'src'));
  const source = JSON.parse(await readFile(join(root, 'src/manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (source.version !== pkg.version) {
    throw new Error(`manifest version ${source.version} != package.json ${pkg.version}`);
  }
  const written = [];
  for (const browser of browsers)
    written.push(await buildOne({ root, outDir: out, browser, source }));
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2] ?? 'all';
  const browsers = arg === 'all' ? BROWSERS : [arg];
  if (process.argv.length > 3 || (arg !== 'all' && !BROWSERS.includes(arg))) {
    console.error('usage: node scripts/build.mjs [firefox|chrome|safari|all]');
    process.exit(2);
  }
  const dirs = await build({ browsers });
  for (const d of dirs) console.log(`built ${relative(process.cwd(), d)}`);
}
