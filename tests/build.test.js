import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, listFiles } from '../scripts/build.mjs';
import { BROWSERS, bundleIcons } from '../scripts/manifest-transform.mjs';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8'));
let root;
let dist;

// A throwaway project root: real src + export PNGs, plus decoys that must never be shipped.
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'xmark-build-'));
  await cp(join(REPO, 'src'), join(root, 'src'), { recursive: true });
  await cp(join(REPO, 'assets/branding/export'), join(root, 'assets/branding/export'), {
    recursive: true,
  });
  await cp(join(REPO, 'package.json'), join(root, 'package.json'));
  for (const d of ['.local', '.superpowers', 'dev', 'scripts', 'tests']) {
    await mkdir(join(root, d), { recursive: true });
    await writeFile(join(root, d, 'decoy.js'), '//');
  }
  dist = join(root, 'dist');
  await build({ root, browsers: BROWSERS });
});

after(() => rm(root, { recursive: true, force: true }));

const manifestOf = async (b) => JSON.parse(await readFile(join(dist, b, 'manifest.json'), 'utf8'));

test('builds one bundle per browser, each with a manifest at the root', async () => {
  assert.deepEqual((await readdir(dist)).sort(), [...BROWSERS].sort());
  for (const b of BROWSERS) assert.ok((await stat(join(dist, b, 'manifest.json'))).isFile());
});

test('every bundle ships the runtime tree and never dev material', async () => {
  for (const b of BROWSERS) {
    const files = await listFiles(join(dist, b));
    for (const must of [
      'background/background.js',
      'platform/browser-api.js',
      'popup/popup.html',
      'options/options.html',
      'content/messages.js',
      'content/main.js',
      'core/model.js',
    ]) {
      assert.ok(files.includes(must), `${b} has ${must}`);
    }
    for (const f of files) {
      assert.doesNotMatch(f, /^(\.local|\.superpowers|dev|scripts|tests|node_modules|assets)\//, f);
      assert.doesNotMatch(f, /\.(test|map)\.|\.DS_Store|decoy/, f);
    }
  }
});

test('every file the manifest references exists in its bundle', async () => {
  for (const b of BROWSERS) {
    const m = await manifestOf(b);
    const refs = [
      m.action.default_popup,
      m.options_ui.page,
      ...Object.values(m.icons),
      ...[].concat(
        typeof m.action.default_icon === 'string'
          ? m.action.default_icon
          : Object.values(m.action.default_icon),
      ),
      ...(m.action.theme_icons ?? []).flatMap((t) => [t.light, t.dark]),
      ...m.content_scripts.flatMap((c) => c.js),
      m.background.service_worker,
      ...(m.background.scripts ?? []),
    ].filter(Boolean);
    for (const ref of refs) assert.ok((await stat(join(dist, b, ref))).isFile(), `${b}: ${ref}`);
  }
});

test('manifest versions equal package.json version', async () => {
  for (const b of BROWSERS) assert.equal((await manifestOf(b)).version, pkg.version);
});

test('chrome and safari ship exactly their PNG icons, byte-identical to the exports', async () => {
  for (const b of ['chrome', 'safari']) {
    const icons = (await listFiles(join(dist, b))).filter((f) => f.startsWith('icons/'));
    assert.deepEqual(
      icons.sort(),
      bundleIcons(b)
        .map((i) => i.bundle)
        .sort(),
    );
    for (const { from, bundle } of bundleIcons(b)) {
      const a = await readFile(join(dist, b, bundle));
      const e = await readFile(join(root, 'assets/branding/export', from));
      assert.ok(a.equals(e), `${b} ${bundle}`);
    }
  }
  assert.equal(bundleIcons('chrome').length, 4);
  assert.equal(bundleIcons('safari').length, 6);
});

test('firefox keeps its SVG icons and has no PNGs', async () => {
  const icons = (await listFiles(join(dist, 'firefox'))).filter((f) => f.startsWith('icons/'));
  assert.deepEqual(icons.sort(), ['icons/icon-dark.svg', 'icons/icon-light.svg']);
});

test('bundles are small and the same source tree', async () => {
  const sizes = {};
  for (const b of BROWSERS) {
    let total = 0;
    for (const f of await listFiles(join(dist, b))) total += (await stat(join(dist, b, f))).size;
    sizes[b] = total;
    assert.ok(total < 400 * 1024, `${b} is ${total} bytes`);
  }
  const code = (b) => listFiles(join(dist, b)).then((l) => l.filter((f) => f.endsWith('.js')));
  assert.deepEqual(await code('chrome'), await code('firefox'));
  assert.deepEqual(await code('safari'), await code('firefox'));
});

test('rebuilding is clean: stale files vanish', async () => {
  await writeFile(join(dist, 'chrome', 'stale.txt'), 'x');
  await build({ root, browsers: ['chrome'] });
  assert.ok(!(await listFiles(join(dist, 'chrome'))).includes('stale.txt'));
});

test('refuses unknown browsers and anything that would write outside dist/', async () => {
  await assert.rejects(build({ root, browsers: ['edge'] }), /unknown browser/);
  await assert.rejects(build({ root, browsers: ['../x'] }), /unknown browser/);
  await assert.rejects(
    build({ root, browsers: ['chrome'], outDir: join(root, 'elsewhere') }),
    /outside dist/,
  );
  await assert.rejects(build({ root, browsers: ['chrome'], outDir: root }), /outside dist/);
});

test('the real repo src has no stray references the build would miss', async () => {
  // A manifest that references a missing file must fail the build, not ship a broken bundle.
  const broken = await mkdtemp(join(tmpdir(), 'xmark-broken-'));
  try {
    await cp(join(root, 'src'), join(broken, 'src'), { recursive: true });
    await cp(join(root, 'assets'), join(broken, 'assets'), { recursive: true });
    await cp(join(root, 'package.json'), join(broken, 'package.json'));
    await rm(join(broken, 'src/popup/popup.html'));
    await assert.rejects(build({ root: broken, browsers: ['chrome'] }), /popup\/popup\.html/);
  } finally {
    await rm(broken, { recursive: true, force: true });
  }
});

async function scratchRoot() {
  const r = await mkdtemp(join(tmpdir(), 'xmark-harden-'));
  await cp(join(root, 'src'), join(r, 'src'), { recursive: true });
  await cp(join(root, 'assets'), join(r, 'assets'), { recursive: true });
  await cp(join(root, 'package.json'), join(r, 'package.json'));
  return r;
}

test('a symlinked dist/ pointing outside the repo is refused and nothing outside is touched', async () => {
  const r = await scratchRoot();
  const outside = await mkdtemp(join(tmpdir(), 'xmark-outside-'));
  try {
    await mkdir(join(outside, 'chrome'));
    await writeFile(join(outside, 'chrome', 'precious.txt'), 'keep');
    await symlink(outside, join(r, 'dist'));
    await assert.rejects(build({ root: r, browsers: ['chrome'] }), /symlink|outside/);
    assert.deepEqual(await readdir(join(outside, 'chrome')), ['precious.txt']);
  } finally {
    await rm(r, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('a symlinked dist/<browser> pointing outside is refused', async () => {
  const r = await scratchRoot();
  const outside = await mkdtemp(join(tmpdir(), 'xmark-outside-'));
  try {
    await writeFile(join(outside, 'precious.txt'), 'keep');
    await mkdir(join(r, 'dist'));
    await symlink(outside, join(r, 'dist', 'chrome'));
    await assert.rejects(build({ root: r, browsers: ['chrome'] }), /outside/);
    assert.deepEqual(await readdir(outside), ['precious.txt']);
  } finally {
    await rm(r, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('outDir is resolved against root: a relative outDir inside dist/ works, ../ escapes fail', async () => {
  const r = await scratchRoot();
  try {
    await build({ root: r, browsers: ['chrome'], outDir: 'dist/sub' });
    assert.ok((await stat(join(r, 'dist/sub/chrome/manifest.json'))).isFile());
    await assert.rejects(
      build({ root: r, browsers: ['chrome'], outDir: '../escape' }),
      /outside dist/,
    );
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('the build fails when src/ contains a symlink', async () => {
  const r = await scratchRoot();
  try {
    await symlink('/etc/hosts', join(r, 'src', 'core', 'sneaky.js'));
    await assert.rejects(build({ root: r, browsers: ['chrome'] }), /symlink/);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

for (const target of ['src', 'tests', 'outside']) {
  test(`dist -> ${target} symlink is refused outright, before anything is created or removed`, async () => {
    const r = await scratchRoot();
    const outside = await mkdtemp(join(tmpdir(), 'xmark-outside-'));
    try {
      await mkdir(join(r, 'tests'));
      await writeFile(join(r, 'tests', 'keep.js'), '//');
      const dest = target === 'outside' ? outside : join(r, target);
      const before = await listFiles(dest);
      await symlink(dest, join(r, 'dist'));
      await assert.rejects(build({ root: r, browsers: ['chrome'] }), /symlink|outside/);
      assert.deepEqual(await listFiles(dest), before);
      assert.deepEqual(await readdir(dest), (await readdir(dest)).filter(Boolean));
      assert.ok(!(await readdir(dest)).includes('chrome'), 'nothing created in the target');
    } finally {
      await rm(r, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
}

test('outDir that does not exist yet is not created when dist/ is unsafe', async () => {
  const r = await scratchRoot();
  const outside = await mkdtemp(join(tmpdir(), 'xmark-outside-'));
  try {
    await symlink(outside, join(r, 'dist'));
    await assert.rejects(build({ root: r, browsers: ['chrome'], outDir: 'dist/new' }));
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(r, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
