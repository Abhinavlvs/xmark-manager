import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReleaseManifest,
  changelogHeadingDate,
  isIsoDate,
  extractChangelogSection,
  formatSha256Sums,
  isVersion,
  isoFromEpoch,
  parseSha256Sums,
  versionFromTag,
  versionMismatches,
} from '../../scripts/release-lib.mjs';
import { releaseDryRun } from '../../scripts/release-dry-run.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

test('versions and tags', () => {
  assert.equal(isVersion('1.2.3'), true);
  assert.equal(isVersion('1.2.3-rc.1'), true);
  for (const bad of ['1.2', 'v1.2.3', '01.2.3', '1.2.3+x', '', null])
    assert.equal(isVersion(bad), false);
  assert.equal(versionFromTag('v1.2.3'), '1.2.3');
  assert.equal(versionFromTag('v1.2.3-rc.1'), '1.2.3-rc.1');
  for (const bad of ['1.2.3', 'v1.2', 'vv1.2.3', undefined, 'release-1.2.3']) {
    assert.throws(() => versionFromTag(bad), /not a release tag/);
  }
});

const CHANGELOG = `# Changelog

## [Unreleased]

- nothing

## [1.2.0] - 2026-02-03

### Added

- thing (1.2.0)

## [1.1.0]

- older

## [1.10.0] - x

- other
`;

test('extractChangelogSection returns exactly the requested section', () => {
  assert.equal(extractChangelogSection(CHANGELOG, '1.2.0'), '### Added\n\n- thing (1.2.0)');
  assert.equal(extractChangelogSection(CHANGELOG, '1.1.0'), '- older');
  assert.equal(extractChangelogSection(CHANGELOG, '1.10.0'), '- other');
  assert.equal(extractChangelogSection(CHANGELOG, '1.2.0').includes('older'), false);
});

test('extractChangelogSection: missing, empty, Unreleased, regex characters, CRLF', () => {
  assert.equal(extractChangelogSection(CHANGELOG, '9.9.9'), null);
  assert.equal(extractChangelogSection(CHANGELOG, 'Unreleased'), '- nothing');
  assert.equal(extractChangelogSection(CHANGELOG, '1x2x0'), null, 'dots are literal');
  assert.equal(extractChangelogSection('## [1.0.0]\n\n## [0.9.0]\n- x', '1.0.0'), null);
  assert.equal(extractChangelogSection('## [1.0.0]\r\n- a\r\n', '1.0.0'), '- a');
});

test('versionMismatches names every disagreeing source', () => {
  assert.deepEqual(versionMismatches('1.0.0', { a: '1.0.0', b: '1.0.0' }), []);
  assert.deepEqual(versionMismatches('1.0.0', { a: '1.0.1', b: undefined }), [
    'a is 1.0.1, expected 1.0.0',
    'b is missing, expected 1.0.0',
  ]);
});

test('SHA256SUMS is sorted, two-space separated, newline terminated, and round-trips', () => {
  const text = formatSha256Sums([
    { name: 'z.zip', sha256: H2 },
    { name: 'a.zip', sha256: H },
  ]);
  assert.equal(text, `${H}  a.zip\n${H2}  z.zip\n`);
  assert.deepEqual(parseSha256Sums(text), [
    { sha256: H, name: 'a.zip' },
    { sha256: H2, name: 'z.zip' },
  ]);
  assert.equal(formatSha256Sums([]), '');
});

test('SHA256SUMS rejects bad digests, paths and malformed lines', () => {
  assert.throws(() => formatSha256Sums([{ name: 'a', sha256: 'xyz' }]), /bad sha256/);
  assert.throws(() => formatSha256Sums([{ name: '../a', sha256: H }]), /plain name/);
  assert.throws(() => formatSha256Sums([{ name: 'a b', sha256: H }]), /plain name/);
  assert.throws(() => parseSha256Sums(`${H} a\n`), /malformed/);
  assert.throws(() => parseSha256Sums(`${H}  dir/a\n`), /malformed/);
});

test('release manifest shape is stable and sorted', () => {
  const m = buildReleaseManifest({
    name: 'xmark-manager',
    version: '1.2.3',
    tag: 'v1.2.3',
    commit: 'c'.repeat(40),
    sourceDate: '2026-01-01T00:00:00.000Z',
    files: [
      { name: 'b.zip', size: 2, sha256: H2, browser: 'chrome' },
      { name: 'a.zip', size: 1, sha256: H },
    ],
  });
  assert.deepEqual(Object.keys(m), [
    'schema',
    'name',
    'version',
    'tag',
    'commit',
    'sourceDate',
    'runtimeDependencies',
    'files',
  ]);
  assert.equal(m.schema, 1);
  assert.deepEqual(m.runtimeDependencies, []);
  assert.deepEqual(m.files, [
    { name: 'a.zip', size: 1, sha256: H },
    { name: 'b.zip', size: 2, sha256: H2, browser: 'chrome' },
  ]);
  assert.throws(() => buildReleaseManifest({ ...m, version: 'v1' }), /bad version/);
});

test('isoFromEpoch', () => {
  assert.equal(isoFromEpoch('0'), '1970-01-01T00:00:00.000Z');
  assert.equal(isoFromEpoch(undefined), null);
  assert.equal(isoFromEpoch(''), null);
  assert.throws(() => isoFromEpoch('abc'), /SOURCE_DATE_EPOCH/);
  assert.throws(() => isoFromEpoch('-5'), /SOURCE_DATE_EPOCH/);
});

let root;
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'xmark-rel-'));
  await cp(join(REPO, 'src'), join(root, 'src'), { recursive: true });
  await cp(join(REPO, 'assets/branding/export'), join(root, 'assets/branding/export'), {
    recursive: true,
  });
  await cp(join(REPO, 'package.json'), join(root, 'package.json'));
});
after(() => rm(root, { recursive: true, force: true }));

const quiet = () => {};
const ENV = { GITHUB_SHA: 'd'.repeat(40), SOURCE_DATE_EPOCH: '1767225600' };

test('releaseDryRun fails without a changelog section and on tag mismatch', async () => {
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
  await assert.rejects(
    releaseDryRun({ root, tag: `v${version}`, env: ENV, log: quiet }),
    /no non-empty "## \[.*\]" section/,
  );
  await writeFile(join(root, 'CHANGELOG.md'), `## [${version}] - 2026-01-01\n\n- ok\n`);
  await assert.rejects(releaseDryRun({ root, tag: 'v9.9.9', env: ENV, log: quiet }), (e) => {
    assert.match(e.message, /package\.json is .*expected 9\.9\.9/);
    assert.match(e.message, /dist\/chrome\/manifest\.json is/);
    return true;
  });
});

test('releaseDryRun writes checksums, manifest and notes that agree with the zips', async () => {
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(root, 'CHANGELOG.md'), `## [${version}] - 2026-01-01\n\n- the notes\n`);
  const result = await releaseDryRun({ root, tag: `v${version}`, env: ENV, log: quiet });
  const dir = join(root, 'dist/release');
  assert.deepEqual(await readdir(dir), [
    'RELEASE_NOTES.md',
    'SHA256SUMS',
    'release-manifest.json',
    `xmark-manager-${version}-chrome.zip`,
    `xmark-manager-${version}-firefox.zip`,
    `xmark-manager-${version}-safari.zip`,
  ]);
  assert.equal(result.version, version);
  assert.equal(await readFile(join(dir, 'RELEASE_NOTES.md'), 'utf8'), '- the notes\n');
  const sums = parseSha256Sums(await readFile(join(dir, 'SHA256SUMS'), 'utf8'));
  assert.equal(sums.length, 3);
  for (const { name, sha256 } of sums) {
    const digest = createHash('sha256')
      .update(await readFile(join(dir, name)))
      .digest('hex');
    assert.equal(digest, sha256, name);
  }
  const manifest = JSON.parse(await readFile(join(dir, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.commit, ENV.GITHUB_SHA);
  assert.equal(manifest.sourceDate, '2026-01-01T00:00:00.000Z');
  assert.equal(manifest.tag, `v${version}`);
  assert.deepEqual(
    manifest.files.map((f) => [f.name, f.sha256]),
    sums.map((s) => [s.name, s.sha256]),
  );
  // Reproducible: a second run yields the same checksums.
  await releaseDryRun({ root, tag: `v${version}`, env: ENV, log: quiet });
  assert.equal(
    await readFile(join(dir, 'SHA256SUMS'), 'utf8'),
    sums.map((s) => `${s.sha256}  ${s.name}\n`).join(''),
  );
});

test('releaseDryRun --check-only writes no release directory', async () => {
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await rm(join(root, 'dist/release'), { recursive: true, force: true });
  const r = await releaseDryRun({ root, version, checkOnly: true, env: ENV, log: quiet });
  assert.equal(r.checkOnly, true);
  assert.equal((await readdir(join(root, 'dist'))).includes('release'), false);
});

test('releaseDryRun refuses an output directory outside dist/', async () => {
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await assert.rejects(
    releaseDryRun({ root, version, out: '../elsewhere', env: ENV, log: quiet }),
    /outside dist/,
  );
});

test('changelog heading date parsing', () => {
  assert.equal(changelogHeadingDate('## [1.0.0] - 2026-02-03\n', '1.0.0'), '2026-02-03');
  assert.equal(
    changelogHeadingDate('## [1.0.0] - TODO(release date)\n', '1.0.0'),
    'TODO(release date)',
  );
  assert.equal(changelogHeadingDate('## [1.0.0]\n', '1.0.0'), null);
  assert.equal(changelogHeadingDate('## [1.0.0]\n', '2.0.0'), null);
  assert.equal(isIsoDate('2026-02-03'), true);
  assert.equal(isIsoDate('TODO'), false);
});

test('a placeholder changelog date fails a real run and only warns in dry-run mode', async () => {
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(root, 'CHANGELOG.md'), `## [${version}] - TODO(release date)\n\n- x\n`);
  await assert.rejects(
    releaseDryRun({ root, version, env: ENV, log: quiet }),
    /no YYYY-MM-DD date/,
  );
  const lines = [];
  const r = await releaseDryRun({
    root,
    version,
    dryRun: true,
    checkOnly: true,
    env: ENV,
    log: (l) => lines.push(l),
  });
  assert.equal(r.checkOnly, true);
  assert.ok(lines.some((l) => l.startsWith('warning:')));
});
