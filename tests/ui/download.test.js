import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from '../../test-support/dom.js';
import { createDownload } from '../../src/ui/download.js';

test('creates a temporary download link, clicks it and cleans up', () => {
  const { document, dom } = makeDom();
  const clicked = [];
  document.addEventListener('click', (e) => clicked.push(e.target));
  const urls = { made: [], revoked: [] };
  const urlApi = {
    createObjectURL: (blob) => {
      urls.made.push(blob);
      return 'blob:fake-1';
    },
    revokeObjectURL: (u) => urls.revoked.push(u),
  };
  createDownload({ dom, urlApi })({
    filename: 'a.json',
    text: '{"x":1}',
    mime: 'application/json',
  });
  assert.equal(clicked.length, 1);
  assert.equal(clicked[0].getAttribute('download'), 'a.json');
  assert.equal(clicked[0].getAttribute('href'), 'blob:fake-1');
  assert.equal(urls.made[0].type, 'application/json');
  assert.equal(urls.made[0].size, 7);
  assert.deepEqual(urls.revoked, ['blob:fake-1']);
  assert.equal(document.querySelector('a'), null);
});
