import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { createIcon, ICON_NAMES } from '../../src/ui/icons.js';

const { document } = parseHTML('<!doctype html><html><body></body></html>');
const pathOf = (name) => createIcon(document, name).querySelector('path').getAttribute('d');

test('every icon is a 24x24 currentColor stroke svg with one path', () => {
  assert.ok(ICON_NAMES.includes('gear'));
  for (const name of ICON_NAMES) {
    const svg = createIcon(document, name);
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24', name);
    assert.equal(svg.getAttribute('stroke'), 'currentColor', name);
    assert.equal(svg.getAttribute('fill'), 'none', name);
    assert.equal(svg.getAttribute('stroke-linejoin'), 'round', name);
    assert.equal(svg.getAttribute('aria-hidden'), 'true', name);
    assert.equal(svg.querySelectorAll('path').length, 1, name);
  }
});

test('the gear is two closed outlines (teeth and hub) inside the grid', () => {
  const d = pathOf('gear');
  assert.equal(d.match(/M/g).length, 2);
  assert.equal(d.match(/Z/g).length, 2);
  assert.equal(d.match(/L/g).length, 24); // 8 teeth, 3 segments each
  assert.equal(d.match(/A/g).length, 8); // 8 root arcs between the teeth
});

test('icons are built with DOM calls, never innerHTML', () => {
  const source = readFileSync(new URL('../../src/ui/icons.js', import.meta.url), 'utf8');
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML/.test(source), false);
});

test('the popup header button is named Settings and is a 40px target', async () => {
  const css = readFileSync(new URL('../../src/popup/popup.css', import.meta.url), 'utf8');
  assert.match(css, /\.icon-btn \{[^}]*width: 40px;[^}]*height: 40px;/);
  const app = readFileSync(new URL('../../src/popup/app.js', import.meta.url), 'utf8');
  assert.match(app, /'aria-label': 'Settings', title: 'Settings'/);
  assert.match(app, /createIcon\(dom\.doc, 'gear', \{ size: 24 \}\)/);
});
