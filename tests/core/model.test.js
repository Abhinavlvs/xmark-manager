import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument, migrate, normalizeDocument, normalizeTags } from '../../src/core/model.js';
import { createId } from '../../src/core/ids.js';
import { systemClock } from '../../src/core/clock.js';
import { fixedClock, sequentialIds } from '../../test-support/fakes.js';

const T = '2026-01-01T00:00:00.000Z';
const post = (over = {}) => ({
  id: 'p1',
  url: 'https://x.com/a/status/1',
  author: 'a',
  text_preview: '',
  folder_id: 'f1',
  tags: ['ai'],
  notes: 'n',
  created_at: T,
  updated_at: T,
  deleted: false,
  ...over,
});
const folder = (over = {}) => ({ id: 'f1', name: 'Reads', updated_at: T, deleted: false, ...over });

test('emptyDocument has version 1 and no records', () => {
  assert.deepEqual(emptyDocument(), { version: 1, folders: [], posts: [] });
});

test('non-object, unknown version, and non-array lists are not ok', () => {
  for (const raw of [null, 'x', 5, [], undefined, { version: 99 }, {}]) {
    assert.deepEqual(normalizeDocument(raw), { doc: emptyDocument(), ok: false });
  }
  assert.equal(normalizeDocument({ version: 1, folders: {}, posts: [] }).ok, false);
  assert.equal(normalizeDocument({ version: 1, folders: [], posts: 'x' }).ok, false);
});

test('valid doc round-trips ok', () => {
  const raw = { version: 1, folders: [folder()], posts: [post()] };
  assert.deepEqual(normalizeDocument(raw), { doc: raw, ok: true });
});

test('malformed records are dropped, the rest kept', () => {
  const raw = {
    version: 1,
    folders: [folder(), { id: 5, name: 'x' }, null, 'x'],
    posts: [
      post(),
      post({ id: '' }),
      post({ id: 7 }),
      post({ tags: 'ai' }),
      null,
      post({ url: 3 }),
    ],
  };
  const { doc, ok } = normalizeDocument(raw);
  assert.equal(ok, true);
  assert.equal(doc.folders.length, 1);
  assert.deepEqual(
    doc.posts.map((p) => p.id),
    ['p1'],
  );
});

test('missing optional fields get defaults', () => {
  const { doc } = normalizeDocument({
    version: 1,
    folders: [{ id: 'f', name: 'N' }],
    posts: [{ id: 'p', url: 'https://x.com/a/status/1', created_at: T, updated_at: T }],
  });
  assert.deepEqual(doc.posts[0], {
    id: 'p',
    url: 'https://x.com/a/status/1',
    author: null,
    text_preview: '',
    folder_id: null,
    tags: [],
    notes: '',
    created_at: T,
    updated_at: T,
    deleted: false,
  });
  assert.equal(doc.folders[0].deleted, false);
  assert.equal(typeof doc.folders[0].updated_at, 'string');
});

test('strings are clamped', () => {
  const { doc } = normalizeDocument({
    version: 1,
    folders: [folder({ name: 'n'.repeat(100) })],
    posts: [
      post({
        notes: 'a'.repeat(6000),
        text_preview: 'b'.repeat(500),
        url: 'https://x.com/a/status/1?' + 'c'.repeat(3000),
      }),
    ],
  });
  assert.equal(doc.folders[0].name.length, 80);
  assert.equal(doc.posts[0].notes.length, 5000);
  assert.equal(doc.posts[0].text_preview.length, 280);
  assert.equal(doc.posts[0].url.length, 2048);
});

test('tags are normalized inside documents', () => {
  const { doc } = normalizeDocument({
    version: 1,
    folders: [],
    posts: [post({ tags: [' AI ', 'ai', 'ML'] })],
  });
  assert.deepEqual(doc.posts[0].tags, ['ai', 'ml']);
});

test('never throws and never mutates input', () => {
  const raw = { version: 1, folders: [folder()], posts: [post({ tags: [' AI '] }), null] };
  const copy = structuredClone(raw);
  normalizeDocument(raw);
  assert.deepEqual(raw, copy);
  const hostile = {
    version: 1,
    folders: [],
    get posts() {
      throw new Error('boom');
    },
  };
  assert.equal(normalizeDocument(hostile).ok, false);
});

test('normalizeTags trims, lowercases, dedupes, drops empties', () => {
  assert.deepEqual(normalizeTags([' AI ', 'ai', '', 'ML']), ['ai', 'ml']);
});

test('normalizeTags caps at 20 tags of 40 chars and ignores non-strings', () => {
  const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
  assert.equal(normalizeTags(many).length, 20);
  assert.equal(normalizeTags(['x'.repeat(60)])[0].length, 40);
  assert.deepEqual(normalizeTags(['a', 3, null]), ['a']);
  assert.deepEqual(normalizeTags('nope'), []);
});

test('createId returns distinct uuid strings', () => {
  const a = createId();
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.notEqual(a, createId());
});

test('systemClock.now returns an ISO timestamp', () => {
  const now = systemClock.now();
  assert.equal(new Date(now).toISOString(), now);
});

test('test fakes behave deterministically', () => {
  const clock = fixedClock(T);
  assert.equal(clock.now(), T);
  assert.equal(clock.now(), T);
  const gen = sequentialIds('id-');
  assert.deepEqual([gen(), gen(), gen()], ['id-1', 'id-2', 'id-3']);
});

test('timestamps are validated and canonicalized to full ISO', () => {
  const { doc } = normalizeDocument({
    version: 1,
    folders: [folder({ updated_at: 'garbage' }), folder({ id: 'f2', updated_at: '2020-01-01' })],
    posts: [
      post({ id: 'a', created_at: 'nope', updated_at: 'garbage' }),
      post({ id: 'b', created_at: '2020-01-01', updated_at: '2021-02-03' }),
      post({ id: 'c', created_at: T, updated_at: T }),
    ],
  });
  const EPOCH = '1970-01-01T00:00:00.000Z';
  assert.equal(doc.folders[0].updated_at, EPOCH);
  assert.equal(doc.folders[1].updated_at, '2020-01-01T00:00:00.000Z');
  assert.equal(doc.posts[0].created_at, EPOCH);
  assert.equal(doc.posts[0].updated_at, EPOCH);
  assert.equal(doc.posts[1].created_at, '2020-01-01T00:00:00.000Z');
  assert.equal(doc.posts[1].updated_at, '2021-02-03T00:00:00.000Z');
  assert.equal(doc.posts[2].created_at, T);
  assert.equal(doc.posts[2].updated_at, T);
});

test('invalid created_at falls back to normalized updated_at', () => {
  const { doc } = normalizeDocument({
    version: 1,
    folders: [],
    posts: [post({ created_at: 'bad', updated_at: '2022-05-06' })],
  });
  assert.equal(doc.posts[0].created_at, '2022-05-06T00:00:00.000Z');
});

test('duplicate ids keep the record with the newest updated_at', () => {
  const old = '2020-01-01T00:00:00.000Z';
  const { doc } = normalizeDocument({
    version: 1,
    folders: [folder({ name: 'new' }), folder({ name: 'old', updated_at: old })],
    posts: [post({ notes: 'new' }), post({ notes: 'old', updated_at: old })],
  });
  assert.equal(doc.folders.length, 1);
  assert.equal(doc.folders[0].name, 'new');
  assert.equal(doc.posts.length, 1);
  assert.equal(doc.posts[0].notes, 'new');
});

test('duplicate-id ties resolve identically regardless of order', () => {
  const a = {
    folders: [folder({ name: 'x' }), folder({ name: 'y' })],
    posts: [post({ notes: 'x' }), post({ notes: 'y' })],
  };
  const fwd = normalizeDocument({ version: 1, ...a }).doc;
  const rev = normalizeDocument({
    version: 1,
    folders: [...a.folders].reverse(),
    posts: [...a.posts].reverse(),
  }).doc;
  assert.deepEqual(fwd, rev);
  assert.equal(fwd.folders.length, 1);
  assert.equal(fwd.posts.length, 1);
});

test('migrate: v1 is an identity migration and reports ok without a reason', () => {
  const raw = { version: 1, folders: [folder()], posts: [post()] };
  assert.deepEqual(migrate(raw), { doc: raw, ok: true, reason: null, dropped: 0 });
});

test('migrate: an unknown FUTURE version is refused, never downgraded', () => {
  const res = migrate({ version: 2, folders: [folder()], posts: [post()] });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'unknown_version');
  assert.deepEqual(res.doc, emptyDocument());
  assert.equal(migrate({ version: '1', folders: [], posts: [] }).reason, 'unknown_version');
});

test('migrate: reasons for non-object and wrong-shape data', () => {
  assert.equal(migrate('junk').reason, 'not_object');
  assert.equal(migrate(null).reason, 'not_object');
  assert.equal(migrate({ version: 1, folders: {}, posts: [] }).reason, 'bad_shape');
  assert.equal(migrate({ folders: [], posts: 'x' }).reason, 'bad_shape');
});

test('migrate: a missing version with a recognisable shape is v1 only if every record is valid', () => {
  const good = migrate({ folders: [folder()], posts: [post()] });
  assert.equal(good.ok, true);
  assert.equal(good.doc.version, 1);
  assert.equal(good.doc.posts.length, 1);
  const bad = migrate({ folders: [folder()], posts: [post(), { nope: true }] });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'bad_records');
});

test('migrate: a versioned doc with a malformed record stays usable and reports what was dropped', () => {
  const bad = { id: 'b', url: 'https://x.com/a/status/2', tags: 'oops', notes: 'precious' };
  const res = migrate({ version: 1, folders: [{ nope: 1 }], posts: [post(), bad] });
  assert.equal(res.ok, true);
  assert.equal(res.reason, 'records_dropped');
  assert.equal(res.dropped, 2);
  assert.equal(res.doc.posts.length, 1);
});
