/**
 * Shared helpers for the Safari scripts (zero dependencies). Pure functions are exported for tests.
 */

import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const APP_NAME = 'xmark-manager';
// TODO(owner): replace with the reverse-DNS identifier registered in your Apple Developer account.
export const DEFAULT_BUNDLE_ID = 'io.github.xmark-manager.xmark-manager';
const LABEL = '[A-Za-z0-9][A-Za-z0-9-]*';
const BUNDLE_ID_RE = new RegExp(`^${LABEL}(\\.${LABEL})+$`);

/** XMARK_BUNDLE_ID or the placeholder default; throws on a malformed identifier. */
export function resolveBundleId(env = process.env) {
  const id = env.XMARK_BUNDLE_ID || DEFAULT_BUNDLE_ID;
  if (!BUNDLE_ID_RE.test(id)) throw new Error(`invalid bundle identifier: ${id}`);
  // Verified on Xcode 26.6: the converter sets the app id to <id minus its last component>.<app name>
  // but the extension id to <id>.Extension, and xcodebuild then rejects the mismatch (the extension
  // id must be prefixed by the app id). Ending the id with the app name keeps both consistent.
  if (id.split('.').pop() !== APP_NAME) {
    throw new Error(`bundle identifier must end in .${APP_NAME} (converter limitation): ${id}`);
  }
  return id;
}

/** True when `child` is `parent` or lies below it (lexical). */
export const isInside = (parent, child) => child === parent || child.startsWith(parent + sep);

/**
 * Refuses any output path that is not under <root>/safari, resolving symlinks of the nearest
 * existing ancestor so a symlinked safari/ cannot redirect writes elsewhere.
 */
export function assertInsideSafari(root, target) {
  const base = resolve(root, 'safari');
  const out = resolve(root, target);
  if (!isInside(base, out)) throw new Error(`refusing to write outside safari/: ${out}`);
  if (lstatSync(base, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error('refusing to write: safari/ is a symlink');
  }
  if (lstatSync(out, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error(`refusing to write: ${out} is a symlink`);
  }
  let probe = out;
  while (!lstatSync(probe, { throwIfNoEntry: false })) probe = dirname(probe);
  const realRoot = realpathSync(root);
  const realProbe = realpathSync(probe);
  if (!isInside(join(realRoot, 'safari'), realProbe) && realProbe !== realRoot) {
    throw new Error(`refusing to write outside safari/: ${realProbe}`);
  }
  return out;
}

/** Arguments for Apple's converter (flags verified against `--help`, Xcode 26.6). */
export function converterArgs({ bundleDir, projectLocation, appName, bundleId }) {
  return [
    bundleDir,
    '--project-location',
    projectLocation,
    '--app-name',
    appName,
    '--bundle-identifier',
    bundleId,
    '--macos-only',
    '--copy-resources',
    '--no-open',
    '--no-prompt',
    '--force',
  ];
}

/** Arguments for xcodebuild: Debug, no code signing, no team, no provisioning. */
export function xcodebuildArgs({ project, scheme, derivedData }) {
  return [
    '-project',
    project,
    '-scheme',
    scheme,
    '-configuration',
    'Debug',
    '-derivedDataPath',
    derivedData,
    'CODE_SIGN_IDENTITY=-',
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ];
}

/**
 * Name of the converter tool available through xcrun (the packager is the newer name), or null.
 * `platform` and `run` are injectable for tests.
 */
export function findConverter(run = spawnSync, platform = process.platform) {
  if (platform !== 'darwin') return null;
  for (const tool of ['safari-web-extension-packager', 'safari-web-extension-converter']) {
    const r = run('xcrun', ['--find', tool], { encoding: 'utf8' });
    if (r.status === 0) return tool;
  }
  return null;
}

/**
 * {ok:true} when a full Xcode answers `xcodebuild -version`; otherwise {ok:false, reason}.
 * With only the command line tools `xcrun --find xcodebuild` can succeed while xcodebuild exits 1
 * ("requires Xcode"), so the version call is the real check. Arguments only, no shell.
 */
export function checkXcodebuild(run = spawnSync, platform = process.platform) {
  if (platform !== 'darwin') return { ok: false, reason: 'not macOS' };
  const r = run('xcrun', ['xcodebuild', '-version'], { encoding: 'utf8' });
  if (r.status === 0) return { ok: true };
  return {
    ok: false,
    reason: 'xcodebuild does not run (full Xcode required, not only the command line tools)',
  };
}
