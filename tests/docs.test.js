import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(ROOT, 'docs/screenshots');
const REQUIRED = [
  'popup-save.png',
  'popup-saved.png',
  'popup-folders-filter.png',
  'popup-undo.png',
  'x-live-button.png',
  'x-live-panel.png',
  'options-saved.png',
  'options-folders.png',
  'options-data.png',
  'options-privacy.png',
  'options-mobile.png',
  'popup-quarantine-notice.png',
  'options-saved-filtered.png',
  'options-permissions.png',
  'options-about.png',
];
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function readmeImages() {
  const text = await readFile(resolve(ROOT, 'README.md'), 'utf8');
  const out = [];
  for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) out.push({ alt: m[1], src: m[2] });
  for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
    const src = /\bsrc="([^"]*)"/i.exec(m[0]);
    const alt = /\balt="([^"]*)"/i.exec(m[0]);
    out.push({ alt: alt ? alt[1] : '', src: src ? src[1] : '' });
  }
  return out;
}

test('README images exist and have alt text', async () => {
  const images = await readmeImages();
  assert.ok(images.length >= REQUIRED.length);
  for (const { alt, src } of images) {
    assert.ok(alt.trim().length > 0, `empty alt for ${src}`);
    if (/^https?:/.test(src)) continue;
    assert.ok((await stat(resolve(ROOT, src))).isFile(), `missing ${src}`);
  }
});

test('README references every required screenshot', async () => {
  const srcs = (await readmeImages()).map((i) => i.src);
  for (const name of REQUIRED) assert.ok(srcs.includes(`docs/screenshots/${name}`), name);
});

test('README references no screenshot outside the required list', async () => {
  for (const { src } of await readmeImages()) {
    if (!src.startsWith('docs/screenshots/')) continue;
    assert.ok(REQUIRED.includes(src.slice('docs/screenshots/'.length)), `unexpected ${src}`);
  }
});

test('README alt text is descriptive', async () => {
  for (const { alt, src } of await readmeImages()) {
    assert.ok(alt.trim().length > 10, `alt too short for ${src}`);
  }
});

test('SCREENSHOTS.md mentions every required file', async () => {
  const text = await readFile(resolve(ROOT, 'docs/SCREENSHOTS.md'), 'utf8');
  for (const name of REQUIRED) assert.ok(text.includes(name), `not mentioned: ${name}`);
});

test('required screenshots exist', async () => {
  const files = await readdir(SHOTS);
  for (const name of REQUIRED) assert.ok(files.includes(name), `missing ${name}`);
});

test('screenshots are valid, small PNGs of exactly 1280x800', async () => {
  for (const name of await readdir(SHOTS)) {
    if (!name.endsWith('.png')) continue;
    const buf = await readFile(resolve(SHOTS, name));
    assert.ok(buf.length < 400 * 1024, `${name} is ${buf.length} bytes`);
    assert.ok(buf.subarray(0, 8).equals(SIGNATURE), `${name} is not a PNG`);
    const width = buf.readUInt32BE(16);
    assert.equal(width, 1280, `${name} width ${width}`);
    const height = buf.readUInt32BE(20);
    assert.equal(height, 800, `${name} height ${height}`);
  }
});
