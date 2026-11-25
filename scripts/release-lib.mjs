/**
 * Pure helpers for the release pipeline (no I/O, no network). Used by release-dry-run.mjs, which
 * both `npm run release:dry-run` and .github/workflows/release.yml call, so CI and local agree.
 */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

/** @returns {boolean} true for `x.y.z` or `x.y.z-pre` (no `v`, no build metadata). */
export const isVersion = (v) => typeof v === 'string' && SEMVER.test(v);

/**
 * Accepts `v1.2.3` (a tag) and returns `1.2.3`; throws on anything else.
 * @param {string} tag
 */
export function versionFromTag(tag) {
  const m = /^v(.+)$/.exec(String(tag ?? ''));
  if (!m || !isVersion(m[1])) throw new Error(`not a release tag (expected vX.Y.Z): ${tag}`);
  return m[1];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Returns the body of the `## [version]` section of a Keep a Changelog file, without the heading
 * line, trimmed; or null when the section is missing or has no content.
 * The heading may carry a date suffix (`## [1.0.0] - 2026-01-31`); `[Unreleased]` never matches.
 * @param {string} changelog
 * @param {string} version
 */
export function extractChangelogSection(changelog, version) {
  const lines = String(changelog).replace(/\r\n/g, '\n').split('\n');
  const head = new RegExp(`^## \\[${escapeRe(version)}\\](?:\\s.*)?$`);
  const start = lines.findIndex((l) => head.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  return body === '' ? null : body;
}

/**
 * The date of the `## [version] - DATE` heading: an ISO date string, the raw suffix (for example a
 * `TODO(...)` placeholder) when it is not one, or null when there is no heading or no suffix.
 * @param {string} changelog
 * @param {string} version
 */
export function changelogHeadingDate(changelog, version) {
  const head = new RegExp(`^## \\[${escapeRe(version)}\\](.*)$`, 'm');
  const m = head.exec(String(changelog).replace(/\r\n/g, '\n'));
  const suffix = m?.[1].replace(/^\s*-\s*/, '').trim();
  return suffix ? suffix : null;
}

export const isIsoDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * Compares every version source against the expected one.
 * @param {string} expected
 * @param {Record<string, string|undefined>} found  label -> version
 * @returns {string[]} one message per mismatch (empty when consistent)
 */
export function versionMismatches(expected, found) {
  return Object.entries(found)
    .filter(([, v]) => v !== expected)
    .map(([label, v]) => `${label} is ${v === undefined ? 'missing' : v}, expected ${expected}`);
}

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * `sha256sum -c` compatible text: `<hex>  <name>` per line, sorted by name (byte order), LF only,
 * trailing newline. Entry order in `entries` does not matter.
 * @param {{name: string, sha256: string}[]} entries
 */
export function formatSha256Sums(entries) {
  const sorted = [...entries].sort(byName);
  for (const e of sorted) {
    if (!/^[0-9a-f]{64}$/.test(e.sha256)) throw new Error(`bad sha256 for ${e.name}`);
    if (/[\s/\\]/.test(e.name)) throw new Error(`file name must be a plain name: ${e.name}`);
  }
  return sorted.map((e) => `${e.sha256}  ${e.name}\n`).join('');
}

/** Parses SHA256SUMS text back into entries; throws on malformed lines. */
export function parseSha256Sums(text) {
  return String(text)
    .split('\n')
    .filter((l) => l !== '')
    .map((line) => {
      const m = /^([0-9a-f]{64}) {2}([^\s/\\]+)$/.exec(line);
      if (!m) throw new Error(`malformed SHA256SUMS line: ${line}`);
      return { sha256: m[1], name: m[2] };
    });
}

/**
 * A small software-bill-of-materials style description of the release (not a full SPDX/CycloneDX
 * SBOM: the extension has zero runtime dependencies, which is stated explicitly).
 * @param {{name: string, version: string, tag?: string|null, commit: string, sourceDate: string|null,
 *   files: {name: string, size: number, sha256: string, browser?: string}[]}} input
 */
export function buildReleaseManifest({ name, version, tag = null, commit, sourceDate, files }) {
  if (!isVersion(version)) throw new Error(`bad version: ${version}`);
  return {
    schema: 1,
    name,
    version,
    tag,
    commit,
    sourceDate,
    runtimeDependencies: [],
    files: [...files].sort(byName).map(({ name: n, size, sha256, browser }) => ({
      name: n,
      size,
      sha256,
      ...(browser ? { browser } : {}),
    })),
  };
}

/**
 * Differences between two sets of {name, sha256} entries (downloaded files versus a fresh
 * rebuild). An empty array means identical names and digests.
 * @param {{name: string, sha256: string}[]} downloaded
 * @param {{name: string, sha256: string}[]} rebuilt
 */
export function checksumDifferences(downloaded, rebuilt) {
  const a = new Map(downloaded.map((e) => [e.name, e.sha256]));
  const b = new Map(rebuilt.map((e) => [e.name, e.sha256]));
  const out = [];
  for (const [name, sha] of a) {
    if (!b.has(name)) out.push(`${name}: not produced by the rebuild`);
    else if (b.get(name) !== sha)
      out.push(`${name}: sha256 differs (downloaded ${sha}, rebuilt ${b.get(name)})`);
  }
  for (const name of b.keys()) if (!a.has(name)) out.push(`${name}: missing from the download`);
  return out.sort();
}

/** @param {number|string|undefined|null} epoch seconds since the Unix epoch (SOURCE_DATE_EPOCH) */
export function isoFromEpoch(epoch) {
  if (epoch === undefined || epoch === null || epoch === '') return null;
  const n = Number(epoch);
  if (!Number.isInteger(n) || n < 0) throw new Error(`bad SOURCE_DATE_EPOCH: ${epoch}`);
  return new Date(n * 1000).toISOString();
}
