import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksumDifferences } from '../../scripts/release-lib.mjs';
import { releaseDryRun } from '../../scripts/release-dry-run.mjs';
import { verifyRebuild } from '../../scripts/verify-rebuild.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const quiet = () => {};
const ENV = { GITHUB_SHA: 'd'.repeat(40), SOURCE_DATE_EPOCH: '1767225600' };

test('checksumDifferences reports changed, missing and extra files', () => {
  assert.deepEqual(checksumDifferences([{ name: 'a', sha256: H }], [{ name: 'a', sha256: H }]), []);
  const d = checksumDifferences(
    [
      { name: 'a', sha256: H },
      { name: 'only-download', sha256: H },
    ],
    [
      { name: 'a', sha256: H2 },
      { name: 'only-rebuild', sha256: H },
    ],
  );
  assert.equal(d.length, 3);
  assert.ok(d.some((l) => l.startsWith('a: sha256 differs')));
  assert.ok(d.some((l) => l.startsWith('only-download: not produced')));
  assert.ok(d.some((l) => l.startsWith('only-rebuild: missing')));
});

let root;
let version;
let dl;
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'xmark-rebuild-'));
  await cp(join(REPO, 'src'), join(root, 'src'), { recursive: true });
  await cp(join(REPO, 'assets/branding/export'), join(root, 'assets/branding/export'), {
    recursive: true,
  });
  await cp(join(REPO, 'package.json'), join(root, 'package.json'));
  version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  await writeFile(join(root, 'CHANGELOG.md'), `## [${version}] - 2026-01-01\n\n- notes\n`);
  await releaseDryRun({ root, tag: `v${version}`, env: ENV, log: quiet });
  dl = join(root, 'downloaded');
  await cp(join(root, 'dist/release'), dl, { recursive: true });
});
after(() => rm(root, { recursive: true, force: true }));

test('verifyRebuild accepts the untouched release files', async () => {
  const r = await verifyRebuild({ root, tag: `v${version}`, dir: dl, env: ENV, log: quiet });
  assert.equal(r.checked.length, 3);
});

test('verifyRebuild rejects a modified zip, a changed SHA256SUMS and a missing zip', async () => {
  const zip = (await readdir(dl)).find((n) => n.endsWith('-chrome.zip'));
  const original = await readFile(join(dl, zip));
  await writeFile(join(dl, zip), Buffer.concat([original, Buffer.from('x')]));
  await assert.rejects(
    verifyRebuild({ root, tag: `v${version}`, dir: dl, env: ENV, log: quiet }),
    /chrome\.zip: sha256 differs/,
  );
  await writeFile(join(dl, zip), original);
  const sums = await readFile(join(dl, 'SHA256SUMS'), 'utf8');
  await writeFile(
    join(dl, 'SHA256SUMS'),
    sums.replace(/^./, (c) => (c === '0' ? '1' : '0')),
  );
  await assert.rejects(
    verifyRebuild({ root, tag: `v${version}`, dir: dl, env: ENV, log: quiet }),
    /SHA256SUMS does not match/,
  );
  await writeFile(join(dl, 'SHA256SUMS'), sums);
  await rm(join(dl, zip));
  await assert.rejects(
    verifyRebuild({ root, tag: `v${version}`, dir: dl, env: ENV, log: quiet }),
    /chrome\.zip: not produced|missing from the download/,
  );
});

test('verifyRebuild needs a tag and a directory', async () => {
  await assert.rejects(verifyRebuild({ root, dir: dl }), /--tag and --dir/);
});
