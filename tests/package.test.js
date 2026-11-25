import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip, zipDirectory, readZipEntries } from '../scripts/zip.mjs';
import { packageAll } from '../scripts/package.mjs';

const REPO = fileURLToPath(new URL('../', import.meta.url));
let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'xmark-pkg-'));
  await cp(join(REPO, 'src'), join(root, 'src'), { recursive: true });
  await cp(join(REPO, 'assets/branding/export'), join(root, 'assets/branding/export'), {
    recursive: true,
  });
  await cp(join(REPO, 'package.json'), join(root, 'package.json'));
});

after(() => rm(root, { recursive: true, force: true }));

test('zipDirectory writes a valid, deterministic archive of every file', async () => {
  const src = join(root, 'zsrc');
  await mkdir(join(src, 'sub'), { recursive: true });
  await writeFile(join(src, 'a.txt'), 'hello '.repeat(500));
  await writeFile(join(src, 'sub', 'b.bin'), Buffer.from([0, 1, 2, 255]));
  await writeFile(join(src, 'empty.txt'), '');
  const one = join(root, 'one.zip');
  const two = join(root, 'two.zip');
  await zipDirectory(src, one);
  await zipDirectory(src, two);
  assert.ok((await readFile(one)).equals(await readFile(two)), 'byte-identical across runs');
  const entries = readZipEntries(await readFile(one));
  assert.deepEqual(
    entries.map((e) => e.name),
    ['a.txt', 'empty.txt', 'sub/b.bin'],
  );
  assert.equal(entries[0].data.toString(), 'hello '.repeat(500));
  assert.deepEqual([...entries[2].data], [0, 1, 2, 255]);
});

test('the archive passes the system unzip integrity test when unzip exists', async (t) => {
  const zip = join(root, 'one.zip');
  try {
    execFileSync('unzip', ['-tq', zip], { stdio: 'pipe' });
  } catch (error) {
    if (error.code === 'ENOENT') return t.skip('unzip not installed');
    throw error;
  }
});

test('packageAll builds all bundles and one zip per browser, repeatedly', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (let run = 0; run < 2; run++) {
    const zips = await packageAll({ root });
    assert.equal(zips.length, 3);
  }
  const dir = join(root, 'dist', 'zips');
  assert.deepEqual((await readdir(dir)).sort(), [
    `xmark-manager-${pkg.version}-chrome.zip`,
    `xmark-manager-${pkg.version}-firefox.zip`,
    `xmark-manager-${pkg.version}-safari.zip`,
  ]);
  for (const b of ['firefox', 'chrome', 'safari']) {
    const names = readZipEntries(
      await readFile(join(dir, `xmark-manager-${pkg.version}-${b}.zip`)),
    ).map((e) => e.name);
    assert.ok(names.includes('manifest.json'), `${b} manifest at zip root`);
    assert.ok(names.includes('background/background.js'));
    assert.ok(!names.some((n) => n.startsWith('dist/') || n.startsWith('zips/')), b);
  }
});

test('central directory records Unix permissions: 0644 files, 0755 directories, made by Unix', async () => {
  const zip = createZip([
    { name: 'a.txt', data: Buffer.from('a') },
    { name: 'dir/', data: Buffer.alloc(0) },
  ]);
  const [file, dir] = readZipEntries(zip);
  assert.equal(file.versionMadeBy, 0x0314);
  assert.equal(file.externalAttrs >>> 16, 0o100644);
  assert.equal(dir.versionMadeBy, 0x0314);
  assert.equal(dir.externalAttrs >>> 16, 0o040755);
  assert.equal(dir.externalAttrs & 0x10, 0x10, 'MS-DOS directory bit');
  const real = await readFile(join(root, 'one.zip'));
  for (const e of readZipEntries(real)) assert.equal(e.externalAttrs >>> 16, 0o100644, e.name);
});
