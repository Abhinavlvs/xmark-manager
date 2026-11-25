import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { POLYGONS, TRANSLATE, VIEW_BOX } from '../src/ui/logo-paths.js';

const root = new URL('../', import.meta.url);
const srcUrl = (p) => new URL(`src/${p}`, root);
const manifest = JSON.parse(await readFile(srcUrl('manifest.json'), 'utf8'));
const read = (p) => readFile(new URL(p, root), 'utf8');

const files = {
  'src/icons/icon-light.svg': 'white',
  'src/icons/icon-dark.svg': 'black',
  'assets/branding/logo-xm.svg': 'black',
  'assets/branding/logo-xm-white.svg': 'white',
};

test('manifest icons and action icons point to existing files', async () => {
  const used = new Set(Object.values(manifest.icons));
  used.add(manifest.action.default_icon);
  for (const t of manifest.action.theme_icons) {
    used.add(t.light);
    used.add(t.dark);
  }
  for (const f of used) assert.ok((await stat(srcUrl(f))).isFile(), `${f} exists`);
  assert.deepEqual(Object.keys(manifest.icons), ['16', '32', '48', '96', '128']);
  assert.equal(manifest.action.default_title, 'xmark-manager');
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.ok((await stat(srcUrl(manifest.action.default_popup))).isFile(), 'popup page exists');
});

test('theme_icons maps light to the white icon and dark to the black icon', () => {
  // MDN (browser_action theme_icons): "light" is for themes with LIGHT text (dark toolbars),
  // "dark" for themes with DARK text (light toolbars).
  const [entry] = manifest.action.theme_icons;
  assert.equal(entry.light, 'icons/icon-light.svg');
  assert.equal(entry.dark, 'icons/icon-dark.svg');
  assert.equal(entry.size, 32);
});

test('shared geometry is six polygons in a 128 viewBox', () => {
  assert.equal(VIEW_BOX, '0 0 128 128');
  assert.equal(TRANSLATE, 'translate(2 0)');
  assert.equal(POLYGONS.length, 6);
});

for (const [path, color] of Object.entries(files)) {
  const svg = await read(path);
  test(`${path} is a small, safe, square SVG of the six polygons`, () => {
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.trimEnd().endsWith('</svg>'));
    assert.ok(svg.includes('width="128" height="128"'), 'width/height 128');
    assert.ok(svg.includes(`viewBox="${VIEW_BOX}"`));
    assert.ok(Buffer.byteLength(svg) < 2048, 'under 2 KB');
    const tags = [...svg.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1]);
    assert.deepEqual(
      [...new Set(tags)].sort(),
      ['g', 'polygon', 'svg'],
      'only svg, g and polygon elements',
    );
    for (const bad of [
      'script',
      'image',
      'href',
      'xlink:href',
      'foreignObject',
      'metadata',
      'mask',
      'clipPath',
      'clip-path',
      'stroke',
      'style',
      'url(',
      'javascript:',
      '<!--',
    ]) {
      assert.ok(!svg.includes(bad), `no ${bad}`);
    }
    assert.ok(svg.includes(`<g transform="${TRANSLATE}" fill="${color}">`));
    const points = [...svg.matchAll(/<polygon points="([^"]+)"\/>/g)].map((m) => m[1]);
    assert.deepEqual(points, POLYGONS);
    assert.equal((svg.match(/<polygon/g) ?? []).length, 6);
  });
}

test('master assets match the toolbar icons', async () => {
  assert.equal(await read('assets/branding/logo-xm.svg'), await read('src/icons/icon-dark.svg'));
  assert.equal(
    await read('assets/branding/logo-xm-white.svg'),
    await read('src/icons/icon-light.svg'),
  );
});

test('the X-derived logo is gone and nothing tracked mentions it', () => {
  assert.ok(!existsSync(new URL('assets/branding/logo-xm-woven.svg', root)));
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['grep', '-l', '-e', 'logo-xm-woven', '--', ':!tests/branding.test.js'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
  } catch {
    // git grep exits 1 when nothing matches, which is what we want.
  }
  assert.equal(out, '');
});
