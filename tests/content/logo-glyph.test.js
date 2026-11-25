import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, resetContent, fire, tick } from '../../test-support/content.js';
import { POLYGONS, TRANSLATE } from '../../src/ui/logo-paths.js';
import { setup } from '../../test-support/panel-setup.js';

afterEach(() => {
  globalThis.__xmark?.stop?.();
  resetContent();
});

test('the monogram duplicated in the content script is identical to src/ui/logo-paths.js', async () => {
  const { xmark } = await loadContent(['dom-util.js', 'save-button.js']);
  assert.deepEqual([...xmark.logoGlyph.POLYGONS], POLYGONS);
  assert.equal(xmark.logoGlyph.TRANSLATE, TRANSLATE);
});

test('the button renders the cropped monogram, aria-hidden, in currentColor', async () => {
  const { api } = await setup();
  const { button } = api();
  const svg = button.querySelector('svg.xm-mark');
  assert.equal(svg.getAttribute('viewBox'), '4 26 122 76');
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.querySelectorAll('polygon').length, POLYGONS.length);
  assert.equal(svg.querySelector('g').getAttribute('fill'), 'currentColor');
  assert.equal(svg.querySelector('path'), null);
  assert.equal(button.querySelector('.xm-badge'), null);
  assert.equal(button.getAttribute('aria-label'), 'Save to xmark-manager');
  assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('after a save the monogram gets a check badge and the Saved label', async () => {
  const { open, window } = await setup();
  const a = await open();
  fire(window, a.panel().querySelector('button.xm-primary'), 'click');
  await tick();
  assert.equal(a.button.getAttribute('aria-pressed'), 'true');
  assert.equal(a.button.getAttribute('aria-label'), 'Saved to xmark-manager');
  assert.equal(a.button.querySelectorAll('svg.xm-mark').length, 1);
  const badge = a.button.querySelector('svg.xm-badge');
  assert.equal(badge.getAttribute('aria-hidden'), 'true');
  assert.equal(badge.querySelector('circle').getAttribute('r'), '5');
  assert.ok(badge.querySelector('path'));
});

test('the 34 px minimum hit target and reduced-motion rule are in the styles', async () => {
  const { xmark } = await loadContent(['dom-util.js', 'styles.js']);
  assert.match(xmark.styles, /\.xm-btn \{[^}]*height: 34px/);
  assert.match(xmark.styles, /prefers-reduced-motion: reduce/);
  assert.match(xmark.styles, /\.xm-btn:hover \{ background: rgba\(29, 155, 240, 0.1\)/);
});
