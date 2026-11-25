import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTestFiles, testArgs } from '../../scripts/run-tests.mjs';

test('listTestFiles finds *.test.js recursively, sorted, skipping dot dirs and node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'xm-list-'));
  for (const d of ['b', 'a/deep', '.hidden', 'node_modules/x'])
    mkdirSync(join(root, d), { recursive: true });
  for (const f of [
    'b/z.test.js',
    'a/deep/m.test.js',
    'a/a.test.js',
    'a/helper.js',
    '.hidden/h.test.js',
    'node_modules/x/n.test.js',
    'top.test.js',
  ]) {
    writeFileSync(join(root, f), '');
  }
  assert.deepEqual(listTestFiles(root), [
    join(root, 'a/a.test.js'),
    join(root, 'a/deep/m.test.js'),
    join(root, 'b/z.test.js'),
    join(root, 'top.test.js'),
  ]);
});

test('listTestFiles returns an empty list for a missing directory', () => {
  assert.deepEqual(listTestFiles(join(tmpdir(), 'xm-does-not-exist-123')), []);
});

test('testArgs uses extra .js args instead of the full list', () => {
  assert.deepEqual(testArgs(['tests/a.test.js', '--flag'], ['x']), ['tests/a.test.js']);
  assert.deepEqual(testArgs([], ['x', 'y']), ['x', 'y']);
});

test('planRun refuses an empty or missing tests directory instead of falling back', async () => {
  const { planRun } = await import('../../scripts/run-tests.mjs');
  const root = mkdtempSync(join(tmpdir(), 'xm-plan-'));
  assert.match(planRun(join(root, 'tests'), []).error, /no test files/i);
  mkdirSync(join(root, 'tests'));
  assert.match(planRun(join(root, 'tests'), []).error, /no test files/i);
  writeFileSync(join(root, 'tests/a.test.js'), '');
  assert.deepEqual(planRun(join(root, 'tests'), []).files, [join(root, 'tests/a.test.js')]);
});
