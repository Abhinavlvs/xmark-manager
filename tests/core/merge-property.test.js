import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocuments, TOMBSTONE_TTL_MS } from '../../src/core/merge.js';

const NOW = '2026-06-01T00:00:00.000Z';
const OPTS = { now: NOW, tombstoneTtlMs: TOMBSTONE_TTL_MS };
const TIMES = [
  '2026-05-01T00:00:00.000Z',
  '2026-05-02T00:00:00.000Z',
  '2026-05-03T00:00:00.000Z',
  '2026-05-04T00:00:00.000Z',
];
const URLS = [
  'https://x.com/Alice/status/1',
  'https://x.com/alice/status/1',
  'https://x.com/i/web/status/1',
  'https://x.com/Bob/status/2',
  'https://x.com/i/web/status/2',
];

/** Small deterministic PRNG so a failure can be replayed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomDoc(rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const ids = ['a', 'b', 'c', 'd'].filter(() => rand() < 0.6);
  return {
    version: 1,
    folders: [],
    posts: ids.map((id) => {
      const url = pick(URLS);
      const deleted = rand() < 0.2;
      return {
        id,
        url,
        author: url.includes('/i/web/') ? null : url.split('/')[3],
        text_preview: '',
        folder_id: pick([null, 'f1']),
        tags: pick([[], ['x'], ['y']]),
        notes: deleted ? '' : pick(['', 'n1', 'n2']),
        created_at: TIMES[0],
        updated_at: pick(TIMES),
        deleted,
      };
    }),
  };
}

test('5,000 random merges including /i/web URLs are commutative and idempotent', () => {
  const rand = rng(20261121);
  for (let n = 0; n < 5000; n += 1) {
    const a = randomDoc(rand);
    const b = randomDoc(rand);
    const m = mergeDocuments(a, b, OPTS);
    const label = `case ${n}: ${JSON.stringify({ a, b })}`;
    assert.deepEqual(mergeDocuments(b, a, OPTS), m, `commutative, ${label}`);
    assert.deepEqual(mergeDocuments(m, m, OPTS), m, `idempotent, ${label}`);
    assert.deepEqual(mergeDocuments(m, a, OPTS), m, `absorbs a, ${label}`);
    assert.deepEqual(mergeDocuments(m, b, OPTS), m, `absorbs b, ${label}`);
    const live = m.posts.filter((p) => !p.deleted).map((p) => p.url.match(/status\/(\d+)$/)[1]);
    assert.equal(new Set(live).size, live.length, `one live post per status, ${label}`);
  }
});
