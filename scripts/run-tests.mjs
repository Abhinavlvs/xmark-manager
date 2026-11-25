// Runs only this repo's tests (tests/**/*.test.js). Plain `node --test` would also pick up
// other checkouts that live inside the repo (for example .claude/worktrees/).
import { mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every `*.test.js` under `dir`, sorted; skips node_modules and dot-directories. */
export function listTestFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      found.push(...listTestFiles(join(dir, e.name)));
    } else if (e.isFile() && e.name.endsWith('.test.js')) found.push(join(dir, e.name));
  }
  return found.sort();
}

/** Extra CLI args ending in .js replace the full list; everything else is ignored. */
export function testArgs(argv, all) {
  const extra = argv.filter((a) => a.endsWith('.js'));
  return extra.length > 0 ? extra : all;
}

/**
 * Extra node flags for `--coverage`: built-in V8 coverage of src/ only, a spec report on stdout and
 * an lcov file in coverage/ (git-ignored) for tools that read it. Node 22 or newer.
 */
export function coverageFlags(argv) {
  if (!argv.includes('--coverage')) return [];
  return [
    '--experimental-test-coverage',
    '--test-coverage-include=src/**/*.js',
    '--test-coverage-lines=80',
    '--test-coverage-functions=70',
    '--test-coverage-branches=60',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=lcov',
    '--test-reporter-destination=coverage/lcov.info',
  ];
}

/** What to run: the files, or an error when there is nothing (never node's own discovery). */
export function planRun(testsDir, argv) {
  const files = testArgs(argv, listTestFiles(testsDir));
  return files.length > 0 ? { files } : { error: `No test files found under ${testsDir}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { files, error } = planRun(join(root, 'tests'), process.argv.slice(2));
  if (error) {
    console.error(error);
    process.exit(1);
  }
  if (process.argv.includes('--coverage')) mkdirSync(join(root, 'coverage'), { recursive: true });
  const run = spawnSync(
    process.execPath,
    ['--test', ...coverageFlags(process.argv.slice(2)), ...files],
    { stdio: 'inherit', cwd: root },
  );
  process.exit(run.status ?? 1);
}
