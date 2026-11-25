import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../../src/options/router.js';

function fakeWin(hash = '') {
  const listeners = [];
  let current = hash;
  return {
    location: {
      get hash() {
        return current;
      },
      set hash(next) {
        current = next;
        listeners.forEach((fn) => fn());
      },
    },
    addEventListener: (type, fn) => type === 'hashchange' && listeners.push(fn),
    navigate(next) {
      this.location.hash = next;
    },
  };
}
const ROUTES = ['folders', 'sync', 'data'];

test('start routes to the hash, falling back to the first route for unknown hashes', () => {
  for (const [hash, want] of [
    ['#sync', 'sync'],
    ['', 'folders'],
    ['#nope', 'folders'],
    ['#__proto__', 'folders'],
    ['#constructor', 'folders'],
  ]) {
    const seen = [];
    createRouter({ win: fakeWin(hash), routes: ROUTES, onRoute: (n) => seen.push(n) }).start();
    assert.deepEqual(seen, [want], hash);
  }
});

test('folders-add routes to folders with the add flag', () => {
  const seen = [];
  createRouter({
    win: fakeWin('#folders-add'),
    routes: ROUTES,
    onRoute: (...a) => seen.push(a),
  }).start();
  assert.deepEqual(seen, [['folders', { add: true }]]);
  const bogus = [];
  createRouter({
    win: fakeWin('#nope-add'),
    routes: ROUTES,
    onRoute: (...a) => bogus.push(a),
  }).start();
  assert.deepEqual(bogus, [['folders']]);
});

test('hashchange (back and forward) re-routes; go sets the hash', () => {
  const win = fakeWin('#folders');
  const seen = [];
  const router = createRouter({ win, routes: ROUTES, onRoute: (n) => seen.push(n) });
  router.start();
  win.navigate('#data');
  router.go('sync');
  assert.equal(win.location.hash, 'sync');
  win.navigate('#folders');
  assert.deepEqual(seen, ['folders', 'data', 'sync', 'folders']);
});

test('saved is a route and the landing default when it is listed first', () => {
  const routes = ['saved', 'folders', 'data'];
  for (const [hash, want] of [
    ['', 'saved'],
    ['#saved', 'saved'],
    ['#folders', 'folders'],
    ['#data', 'data'],
    ['#nope', 'saved'],
  ]) {
    const seen = [];
    createRouter({ win: fakeWin(hash), routes, onRoute: (n) => seen.push(n) }).start();
    assert.deepEqual(seen, [want], hash);
  }
});
