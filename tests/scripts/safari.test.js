import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_NAME,
  DEFAULT_BUNDLE_ID,
  assertInsideSafari,
  checkXcodebuild,
  converterArgs,
  findConverter,
  resolveBundleId,
  xcodebuildArgs,
} from '../../scripts/safari/common.mjs';
import { convert } from '../../scripts/safari/convert.mjs';
import { buildApp } from '../../scripts/safari/build.mjs';

test('bundle id: placeholder default, env override, validation', () => {
  assert.equal(resolveBundleId({}), DEFAULT_BUNDLE_ID);
  const id = `com.example.${APP_NAME}`;
  assert.equal(resolveBundleId({ XMARK_BUNDLE_ID: id }), id);
  assert.throws(() => resolveBundleId({ XMARK_BUNDLE_ID: 'nodots' }), /invalid/);
  assert.throws(() => resolveBundleId({ XMARK_BUNDLE_ID: 'a b.c' }), /invalid/);
  // converter limitation: the extension id must be prefixed by the app id
  assert.throws(() => resolveBundleId({ XMARK_BUNDLE_ID: 'com.example.other' }), /must end in/);
});

test('converter args use only documented flags and never open Xcode or prompt', () => {
  const args = converterArgs({
    bundleDir: '/b',
    projectLocation: '/p',
    appName: 'n',
    bundleId: 'i.d',
  });
  assert.deepEqual(args.slice(0, 7), [
    '/b',
    '--project-location',
    '/p',
    '--app-name',
    'n',
    '--bundle-identifier',
    'i.d',
  ]);
  for (const f of ['--macos-only', '--copy-resources', '--no-open', '--no-prompt', '--force']) {
    assert.ok(args.includes(f), f);
  }
});

test('xcodebuild args build unsigned Debug into the given derived data path', () => {
  const args = xcodebuildArgs({ project: 'p.xcodeproj', scheme: 's', derivedData: '/d' });
  assert.ok(args.includes('CODE_SIGNING_ALLOWED=NO'));
  assert.ok(args.includes('CODE_SIGN_IDENTITY=-'));
  assert.equal(args[args.indexOf('-derivedDataPath') + 1], '/d');
  assert.ok(!args.some((a) => /DEVELOPMENT_TEAM|PROVISIONING/.test(a)));
});

test('output is confined to safari/ (lexically and through symlinks)', () => {
  const root = mkdtempSync(join(tmpdir(), 'xmark-safari-test-'));
  const elsewhere = mkdtempSync(join(tmpdir(), 'xmark-safari-elsewhere-'));
  try {
    assert.equal(assertInsideSafari(root, 'safari'), join(root, 'safari'));
    assert.equal(assertInsideSafari(root, 'safari/x/y'), join(root, 'safari/x/y'));
    for (const bad of ['.', 'dist', '../x', 'safari/../dist', '/etc']) {
      assert.throws(() => assertInsideSafari(root, bad), /outside safari/, bad);
    }
    symlinkSync(elsewhere, join(root, 'safari'));
    assert.throws(() => assertInsideSafari(root, 'safari'), /symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('bundle id labels cannot start with a hyphen', () => {
  for (const bad of [
    '-x.xmark-manager',
    '--help.xmark-manager',
    'io.-github.xmark-manager',
    '.a.xmark-manager',
    'io..xmark-manager',
  ]) {
    assert.throws(() => resolveBundleId({ XMARK_BUNDLE_ID: bad }), /invalid/, bad);
  }
  assert.equal(resolveBundleId({ XMARK_BUNDLE_ID: `a-b.9x.${APP_NAME}` }), `a-b.9x.${APP_NAME}`);
});

test('safari/<app name> being a symlink is refused, even into another place under safari/', () => {
  const root = mkdtempSync(join(tmpdir(), 'xmark-safari-test-'));
  const elsewhere = mkdtempSync(join(tmpdir(), 'xmark-safari-elsewhere-'));
  try {
    mkdirSync(join(root, 'safari'));
    mkdirSync(join(root, 'safari', 'real'));
    symlinkSync(elsewhere, join(root, 'safari', APP_NAME));
    assert.throws(() => assertInsideSafari(root, `safari/${APP_NAME}`), /symlink/);
    rmSync(join(root, 'safari', APP_NAME));
    symlinkSync(join(root, 'safari', 'real'), join(root, 'safari', APP_NAME));
    assert.throws(() => assertInsideSafari(root, `safari/${APP_NAME}`), /symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('findConverter: non-darwin is null without running anything; darwin prefers the packager', () => {
  const never = () => assert.fail('must not run on non-darwin');
  assert.equal(findConverter(never, 'linux'), null);
  const seen = [];
  const run = (_cmd, args) => {
    seen.push(args[1]);
    return { status: args[1] === 'safari-web-extension-converter' ? 0 : 1 };
  };
  assert.equal(findConverter(run, 'darwin'), 'safari-web-extension-converter');
  assert.deepEqual(seen, ['safari-web-extension-packager', 'safari-web-extension-converter']);
  assert.equal(
    findConverter(() => ({ status: 1 }), 'darwin'),
    null,
  );
  assert.equal(
    findConverter(() => ({ status: 0 }), 'darwin'),
    'safari-web-extension-packager',
  );
});

test('checkXcodebuild runs `xcodebuild -version` via argv and reports a reason when it fails', () => {
  let call;
  const ok = checkXcodebuild(
    (cmd, args, opts) => ((call = [cmd, args, opts]), { status: 0 }),
    'darwin',
  );
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(call.slice(0, 2), ['xcrun', ['xcodebuild', '-version']]);
  assert.equal(call[2].shell, undefined);
  const bad = checkXcodebuild(() => ({ status: 1 }), 'darwin');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /full Xcode/);
  assert.equal(checkXcodebuild(() => assert.fail('no'), 'linux').ok, false);
});

test('convert validates the bundle id before the SKIP path, and skips without building', async () => {
  const deps = {
    findConverter: () => null,
    build: () => assert.fail('must not build'),
    spawn: () => assert.fail('must not spawn'),
    log: () => {},
  };
  await assert.rejects(convert({ env: { XMARK_BUNDLE_ID: 'bad id' }, deps }), /invalid/);
  assert.deepEqual(await convert({ env: {}, deps }), { skipped: true });
});

test('convert builds the safari bundle first, then runs the converter inside safari/', async () => {
  const root = mkdtempSync(join(tmpdir(), 'xmark-safari-test-'));
  const order = [];
  const deps = {
    findConverter: () => 'safari-web-extension-packager',
    build: async (opts) => (order.push(['build', opts.browsers]), [join(root, 'dist/safari')]),
    spawn: (cmd, args) => (order.push(['spawn', cmd, args]), { status: 0, stdout: '', stderr: '' }),
    log: () => {},
  };
  try {
    const r = await convert({ root, env: {}, deps });
    assert.equal(r.skipped, false);
    assert.deepEqual(order[0], ['build', ['safari']]);
    assert.equal(order[1][0], 'spawn');
    assert.equal(order[1][2][order[1][2].indexOf('--project-location') + 1], join(root, 'safari'));
    await assert.rejects(
      convert({ root, env: {}, deps: { ...deps, spawn: () => ({ status: 3 }) } }),
      /exited with 3/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('convert refuses a symlinked safari/<app name> before building', async () => {
  const root = mkdtempSync(join(tmpdir(), 'xmark-safari-test-'));
  const elsewhere = mkdtempSync(join(tmpdir(), 'xmark-safari-elsewhere-'));
  mkdirSync(join(root, 'safari'));
  symlinkSync(elsewhere, join(root, 'safari', APP_NAME));
  const deps = {
    findConverter: () => 'x',
    build: () => assert.fail('must not build'),
    spawn: () => assert.fail('must not spawn'),
    log: () => {},
  };
  try {
    await assert.rejects(convert({ root, env: {}, deps }), /symlink/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('buildApp SKIPs with the reason when Xcode is not usable', () => {
  const logs = [];
  const r = buildApp({
    deps: {
      check: () => ({ ok: false, reason: 'no xcode' }),
      spawn: () => assert.fail('no'),
      log: (m) => logs.push(m),
    },
  });
  assert.deepEqual(r, { skipped: true, reason: 'no xcode' });
  assert.match(logs[0], /SKIP: no xcode/);
});

test('buildApp removes the derived-data directory after a failed build, keeps it after success', () => {
  const root = mkdtempSync(join(tmpdir(), 'xmark-safari-test-'));
  mkdirSync(join(root, 'safari', APP_NAME, `${APP_NAME}.xcodeproj`), { recursive: true });
  const dd = mkdtempSync(join(tmpdir(), 'xmark-safari-dd-test-'));
  const removed = [];
  const base = {
    check: () => ({ ok: true }),
    makeTemp: () => dd,
    log: () => {},
    remove: (d) => removed.push(d),
  };
  try {
    assert.throws(
      () =>
        buildApp({
          root,
          deps: { ...base, spawn: () => ({ status: 65, stdout: '', stderr: 'boom' }) },
        }),
      /xcodebuild failed/,
    );
    assert.deepEqual(removed, [dd]);
    mkdirSync(join(dd, 'Build', 'Products', 'Debug', 'x.app'), { recursive: true });
    const logs = [];
    const ok = buildApp({
      root,
      deps: {
        ...base,
        log: (m) => logs.push(m),
        spawn: () => ({ status: 0, stdout: '', stderr: '' }),
      },
    });
    assert.equal(ok.app, join(dd, 'Build', 'Products', 'Debug', 'x.app'));
    assert.deepEqual(removed, [dd]);
    assert.ok(logs.some((l) => l.includes(`rm -rf "${dd}"`)));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(dd, { recursive: true, force: true });
  }
});
