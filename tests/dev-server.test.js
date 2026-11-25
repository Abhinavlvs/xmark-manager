import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDevServer } from '../scripts/dev-server.js';

let server;
let base;

before(async () => {
  server = createDevServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

test('binds to loopback only', () => {
  assert.equal(server.address().address, '127.0.0.1');
});

test('serves src files with correct MIME types', async () => {
  const css = await fetch(`${base}/ui/theme.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /^text\/css/);
  const js = await fetch(`${base}/popup/popup.js`);
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
  const html = await fetch(`${base}/dev/popup.html`);
  assert.match(html.headers.get('content-type'), /^text\/html/);
});

test('blocks path traversal and encoded traversal', async () => {
  for (const path of [
    '/../package.json',
    '/%2e%2e/package.json',
    '/dev/../../package.json',
    '/dev/%2e%2e/%2e%2e/package.json',
    '/%00',
  ]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, path);
  }
  const raw = await fetch(`${base}/..%2fpackage.json`);
  assert.equal(raw.status, 404);
});

test('no directory listing', async () => {
  for (const path of ['/', '/popup/', '/dev/']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
});

test('rejects non-GET methods', async () => {
  assert.equal((await fetch(`${base}/ui/theme.css`, { method: 'POST' })).status, 405);
});
