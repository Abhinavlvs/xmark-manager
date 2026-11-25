import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, resetContent } from '../../test-support/content.js';

afterEach(resetContent);

const rect = (top, left, size = 34) => ({ top, left, bottom: top + size, right: left + size });
const place = async (args) => (await loadContent(['placement.js'])).xmark.placePanel(args);
const panelSize = { width: 320, height: 250 };
const viewport = { width: 1000, height: 800 };

test('below and right-aligned when there is room', async () => {
  assert.deepEqual(await place({ buttonRect: rect(100, 600), panelSize, viewport }), {
    placement: 'below',
    align: 'right',
    left: 314,
    top: 138,
  });
});

test('flips above when there is not enough room below', async () => {
  const out = await place({ buttonRect: rect(700, 600), panelSize, viewport });
  assert.equal(out.placement, 'above');
});

test('stays below when neither side fits but below has more room', async () => {
  const out = await place({
    buttonRect: rect(100, 600),
    panelSize: { width: 320, height: 900 },
    viewport,
  });
  assert.equal(out.placement, 'below');
});

test('left-aligns when right alignment would overflow the left edge', async () => {
  const out = await place({ buttonRect: rect(100, 20), panelSize, viewport });
  assert.equal(out.align, 'left');
});

test('is total: bad input yields the default', async () => {
  assert.deepEqual(await place({}), { placement: 'below', align: 'right', left: 8, top: 8 });
});

test('keeps right alignment when left alignment would overflow the right edge more', async () => {
  const narrow = { width: 320, height: 800 };
  const out = await place({
    buttonRect: { top: 100, bottom: 134, left: 200, right: 234 },
    panelSize,
    viewport: { ...narrow, width: 330 },
  });
  assert.equal(out.align, 'right');
});

test('above: the panel bottom sits just over the button', async () => {
  const out = await place({ buttonRect: rect(700, 600), panelSize, viewport });
  assert.deepEqual(out, { placement: 'above', align: 'right', left: 314, top: 446 });
});

test('left-aligned panel starts at the button left edge', async () => {
  const out = await place({ buttonRect: rect(100, 20), panelSize, viewport });
  assert.deepEqual([out.left, out.top], [20, 138]);
});

test('clamps to the left edge with an 8 px margin', async () => {
  const out = await place({
    buttonRect: { top: 100, bottom: 134, left: -50, right: -16 },
    panelSize,
    viewport,
  });
  assert.equal(out.left, 8);
});

test('clamps to the right edge with an 8 px margin', async () => {
  const out = await place({ buttonRect: rect(100, 990), panelSize, viewport });
  assert.equal(out.left, 1000 - 8 - 320);
});

test('clamps to the top and the bottom with an 8 px margin', async () => {
  const top = await place({
    buttonRect: rect(-20, 600),
    panelSize: { width: 320, height: 600 },
    viewport: { width: 1000, height: 300 },
  });
  assert.equal(top.top, 8);
  const bottom = await place({
    buttonRect: rect(290, 600),
    panelSize: { width: 320, height: 250 },
    viewport: { width: 1000, height: 300 },
  });
  assert.ok(bottom.top >= 8 && bottom.top + 250 <= 300 - 8);
});

test('tiny viewport: panel larger than the viewport pins to the margin', async () => {
  const out = await place({
    buttonRect: rect(10, 10),
    panelSize,
    viewport: { width: 200, height: 100 },
  });
  assert.equal(out.left, 8);
  assert.equal(out.top, 8);
});

test('anchor partly off screen still yields in-viewport coordinates', async () => {
  const out = await place({ buttonRect: rect(780, 980), panelSize, viewport });
  assert.ok(out.left >= 8 && out.left + 320 <= 1000 - 8);
  assert.ok(out.top >= 8 && out.top + 250 <= 800 - 8);
  assert.equal(out.placement, 'above');
});

test('anchorVisible is false only when the button is fully outside the viewport', async () => {
  const { xmark } = await loadContent(['placement.js']);
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  const el = (r) => ({ getBoundingClientRect: () => ({ width: 34, height: 34, ...r }) });
  assert.equal(xmark.anchorVisible(el(rect(100, 100))), true);
  assert.equal(xmark.anchorVisible(el(rect(-20, 100))), true);
  assert.equal(xmark.anchorVisible(el(rect(-40, 100))), false);
  assert.equal(xmark.anchorVisible(el(rect(801, 100))), false);
  assert.equal(xmark.anchorVisible(el(rect(100, 1001))), false);
  delete globalThis.innerWidth;
  delete globalThis.innerHeight;
});
