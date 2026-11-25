import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from '../scripts/build.mjs';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = (p) => new URL(`../${p}`, import.meta.url);
const json = async (p) => JSON.parse(await readFile(url(p), 'utf8'));

/** The permanent Firefox add-on id (never change after the first upload). */
const GECKO_ID = '{6c820dd8-f422-43e5-bb44-e392b7fac38a}';

test('the gecko id is a real GUID and is the documented one', async () => {
  const { browser_specific_settings: b } = await json('src/manifest.json');
  assert.match(b.gecko.id, /^\{[0-9a-f-]{36}\}$/);
  assert.equal(b.gecko.id, GECKO_ID);
  for (const doc of ['README.md', 'docs/AMO_SUBMISSION.md']) {
    assert.ok((await readFile(url(doc), 'utf8')).includes(GECKO_ID), `${doc} names the id`);
  }
});

test('the e2e harness uses the manifest id', async () => {
  const lib = await readFile(url('scripts/e2e/lib.mjs'), 'utf8');
  assert.ok(lib.includes(GECKO_ID));
});

test('release version 0.1.0 is shared by package, lock file, manifest and bundles', async () => {
  const pkg = await json('package.json');
  const lock = await json('package-lock.json');
  const manifest = await json('src/manifest.json');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(lock.version, '0.1.0');
  assert.equal(lock.packages[''].version, '0.1.0');
  assert.equal(manifest.version, '0.1.0');
  const root = await mkdtemp(join(tmpdir(), 'xmark-rel-'));
  try {
    await cp(url('src'), join(root, 'src'), { recursive: true });
    await cp(url('assets/branding/export'), join(root, 'assets/branding/export'), {
      recursive: true,
    });
    await cp(url('package.json'), join(root, 'package.json'));
    for (const dir of await build({ root })) {
      const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
      assert.equal(m.version, '0.1.0', dir);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the manifest description is short and no homepage URL is invented', async () => {
  const m = await json('src/manifest.json');
  assert.ok(m.description.length > 0 && m.description.length <= 132);
  assert.equal(m.name, 'xmark-manager');
  assert.equal('homepage_url' in m, false);
  assert.equal('default_locale' in m, false);
});

test('the changelog has a dated section for the current version', async () => {
  const text = await readFile(url('CHANGELOG.md'), 'utf8');
  assert.match(text, /^## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}$/m);
});
