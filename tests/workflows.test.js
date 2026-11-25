import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintWorkflow, splitJobs } from '../scripts/release-workflow-lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(ROOT, '.github/workflows');
const SHA = 'a'.repeat(40);
const REQUIRE_PINNED = process.env.REQUIRE_PINNED === '1';

const wf = (body) =>
  `name: t\non: [push]\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${body}`;

test('linter: accepts a pinned, hardened workflow', () => {
  const text = wf(
    `      - uses: actions/checkout@${SHA} # v4\n        with:\n          persist-credentials: false\n      - uses: ./.github/actions/x\n`,
  );
  assert.deepEqual(lintWorkflow(text), { errors: [], unpinned: [] });
});

test('linter: PIN_ME is reported as unpinned, tags and branches are errors', () => {
  const ok = lintWorkflow(
    wf('      - uses: actions/setup-node@PIN_ME # v4\n      - uses: actions/setup-node@PIN_ME\n'),
  );
  assert.deepEqual(ok, { errors: [], unpinned: ['actions/setup-node'] });
  for (const ref of [
    'actions/setup-node@v4',
    'actions/setup-node@main',
    'actions/setup-node',
    'docker://alpine:3',
  ]) {
    const r = lintWorkflow(wf(`      - uses: ${ref}\n`));
    assert.equal(r.errors.length, 1, ref);
    assert.match(r.errors[0], /not pinned/);
  }
  assert.equal(
    lintWorkflow(wf(`      - uses: actions/setup-node@${SHA.slice(1)}\n`)).errors.length,
    1,
  );
});

test('linter: checkout needs persist-credentials false in its own step', () => {
  const bad = wf(
    `      - uses: actions/checkout@${SHA}\n      - uses: actions/setup-node@${SHA}\n        with:\n          persist-credentials: false\n`,
  );
  assert.match(lintWorkflow(bad).errors.join('\n'), /checkout step lacks/);
  const named = wf(
    `      - name: Get code\n        uses: actions/checkout@${SHA}\n        with:\n          fetch-depth: 0\n          persist-credentials: false\n`,
  );
  assert.deepEqual(lintWorkflow(named).errors, []);
  const namedBad = wf(
    `      - name: Get code\n        uses: actions/checkout@${SHA}\n        with:\n          fetch-depth: 0\n`,
  );
  assert.equal(lintWorkflow(namedBad).errors.length, 1);
});

test('linter: permissions, pull_request_target and tabs', () => {
  assert.match(lintWorkflow('name: t\non: push\njobs: {}\n').errors.join(), /permissions/);
  assert.match(
    lintWorkflow('name: t\non:\n  pull_request_target:\npermissions: {}\n').errors.join(),
    /pull_request_target/,
  );
  assert.deepEqual(lintWorkflow('# pull_request_target is banned\npermissions: {}\n').errors, []);
  assert.match(lintWorkflow('permissions: {}\njobs:\n\tx: 1\n').errors.join(), /tab/);
  assert.deepEqual(lintWorkflow('name: composite\n', { isWorkflow: false }).errors, []);
});

test('linter: secrets are forbidden in pull_request workflows but not in dispatch-only ones', () => {
  const body = '      - run: echo hi\n        env:\n          K: ${{ secrets.TOKEN }}\n';
  const pr = `name: t\non:\n  pull_request:\npermissions: {}\njobs:\n  j:\n    steps:\n${body}`;
  const inline = `name: t\non: [push, pull_request]\npermissions: {}\njobs:\n  j:\n    steps:\n${body}`;
  const dispatch = `name: t\non:\n  workflow_dispatch:\npermissions: {}\njobs:\n  j:\n    steps:\n${body}`;
  assert.match(lintWorkflow(pr).errors.join(), /secrets\.TOKEN.*pull_request/);
  assert.match(lintWorkflow(inline).errors.join(), /secrets\.TOKEN/);
  assert.deepEqual(lintWorkflow(dispatch).errors, []);
  const gh = pr.replace('secrets.TOKEN', 'secrets.GITHUB_TOKEN');
  assert.deepEqual(lintWorkflow(gh).errors, []);
});

test('linter: untrusted values must not be interpolated into run scripts', () => {
  const block = wf('      - run: |\n          echo "${{ inputs.name }}"\n');
  const single = wf('      - run: echo ${{ github.event.pull_request.title }}\n');
  const safe = wf(
    '      - env:\n          NAME: ${{ inputs.name }}\n        run: |\n          echo "$NAME"\n',
  );
  const after = wf(
    '      - run: |\n          echo ok\n      - name: x\n        with:\n          a: ${{ inputs.a }}\n',
  );
  assert.match(lintWorkflow(block).errors.join(), /inputs\./);
  assert.match(lintWorkflow(single).errors.join(), /github\.event\./);
  assert.deepEqual(lintWorkflow(safe).errors, []);
  assert.deepEqual(lintWorkflow(after).errors, []);
});

async function files() {
  const out = [];
  for (const name of (await readdir(WORKFLOWS)).sort()) {
    if (/\.ya?ml$/.test(name)) out.push({ path: `.github/workflows/${name}`, isWorkflow: true });
  }
  const actions = join(ROOT, '.github/actions');
  for (const dir of await readdir(actions).catch(() => [])) {
    out.push({ path: `.github/actions/${dir}/action.yml`, isWorkflow: false });
  }
  return out;
}

test('every workflow and local action passes the invariants', async () => {
  for (const f of await files()) {
    const { errors } = lintWorkflow(await readFile(join(ROOT, f.path), 'utf8'), f);
    assert.deepEqual(errors, [], f.path);
  }
});

test('unpinned actions are reported; REQUIRE_PINNED=1 makes them fail', async (t) => {
  const unpinned = new Set();
  for (const f of await files()) {
    for (const a of lintWorkflow(await readFile(join(ROOT, f.path), 'utf8'), f).unpinned) {
      unpinned.add(a);
    }
  }
  const list = [...unpinned].sort();
  t.diagnostic(`PIN_ME actions (${list.length}): ${list.join(', ') || 'none'}`);
  if (REQUIRE_PINNED) assert.deepEqual(list, [], 'pin these actions to full commit SHAs');
});

const text = (name) => readFile(join(WORKFLOWS, name), 'utf8');

test('ci.yml: triggers, concurrency, matrix and least privilege', async () => {
  const ci = await text('ci.yml');
  assert.match(ci, /^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]/m);
  assert.match(ci, /cancel-in-progress: true/);
  assert.match(ci, /^permissions:\n {2}contents: read/m);
  assert.match(ci, /\['20\.x', '22\.x'\]/);
  for (const cmd of [
    'npm ci',
    'npm run lint',
    'npm test',
    'npm run build',
    'npm run build:lint',
    'npm run package',
    'npm audit --omit=dev --audit-level=high',
  ]) {
    assert.ok(ci.includes(cmd), cmd);
  }
  assert.match(ci, /retention-days: 14/);
  assert.match(ci, /inputs\.e2e/);
  const engines = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).engines.node;
  assert.equal(engines, '>=20');
});

test('release.yml: tag trigger, rehearsal-only dispatch, scoped permissions, pinned Node, no cache', async () => {
  const r = await text('release.yml');
  assert.match(r, /tags: \['v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+\*'\]/);
  assert.match(r, /dry_run:\n(?: {8}.*\n)*? {8}default: true/);
  assert.match(r, /manual runs are rehearsals only/);
  assert.match(r, /REQUIRE_PINNED: '1'/);
  assert.match(r, /--draft/);
  assert.match(r, /--verify-tag/);
  assert.doesNotMatch(r, /cache: npm/, 'no dependency cache in the release workflow');
  assert.match(r, /node-version-file: \.nvmrc/);
  // INPUT_VERSION is validated before it reaches $GITHUB_OUTPUT.
  assert.match(r, /version input is not X\.Y\.Z/);
  // The attestation covers the zips and both metadata files.
  assert.match(
    r,
    /subject-path: \|\n\s+release\/\*\.zip\n\s+release\/SHA256SUMS\n\s+release\/release-manifest\.json/,
  );
  const jobs = splitJobs(r);
  assert.deepEqual(
    jobs.map((j) => j.name),
    ['verify', 'package', 'attest', 'github-release'],
  );
  for (const { name, text: t } of jobs) {
    assert.equal(/id-token: write/.test(t), name === 'attest', `id-token in ${name}`);
    assert.equal(/attestations: write/.test(t), name === 'attest', `attestations in ${name}`);
    assert.equal(/contents: write/.test(t), name === 'github-release', `contents write in ${name}`);
  }
  assert.match(r, /needs\.verify\.outputs\.publish == 'true'/);
});

const DEPLOYS = {
  'deploy-firefox.yml': {
    environment: 'amo',
    send: 'node scripts/release-firefox.mjs',
    jobs: ['verify', 'deploy'],
  },
  'deploy-chrome.yml': {
    environment: 'chrome-web-store',
    send: 'node scripts/release-chrome.mjs',
    jobs: ['verify', 'deploy'],
  },
  'deploy-safari.yml': {
    environment: 'app-store-connect',
    send: 'xcodebuild -exportArchive',
    jobs: ['verify', 'unsigned-build', 'deploy'],
  },
};

/** Text with full-line and trailing YAML comments removed (so comments never satisfy a check). */
const stripComments = (t) =>
  t
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .map((l) => l.replace(/\s+#\s.*$/, ''))
    .join('\n');

/** The `if:` expression of a job: the 4-space-indented `if:` line, folded `>-` blocks joined. */
function jobIf(job) {
  const lines = stripComments(job.text).split('\n');
  const i = lines.findIndex((l) => /^ {4}if:/.test(l));
  if (i === -1) return '';
  let out = lines[i].replace(/^ {4}if:\s*/, '');
  for (let j = i + 1; j < lines.length && /^ {6,}\S/.test(lines[j]); j++)
    out += ` ${lines[j].trim()}`;
  return out.replace(/^>-\s*/, '');
}

test('deploy workflows: dispatch only, dry run default, verify input, main-only on every job', async () => {
  for (const [file, { jobs: names }] of Object.entries(DEPLOYS)) {
    const d = await text(file);
    assert.match(d, /^on:\n {2}workflow_dispatch:/m, file);
    assert.doesNotMatch(stripComments(d), /pull_request|push:|schedule:/, file);
    assert.match(d, /dry_run:\n(?: {8}.*\n)*? {8}default: true/, file);
    assert.match(
      d,
      /verify:\n(?: {8}.*\n)*? {8}options: \[attestation, rebuild\]\n {8}default: attestation/,
      file,
    );
    assert.doesNotMatch(stripComments(d), /continue-on-error/, file);
    const jobs = splitJobs(d);
    assert.deepEqual(
      jobs.map((j) => j.name),
      names,
      file,
    );
    for (const j of jobs) {
      const cond = jobIf(j);
      assert.match(cond, /github\.ref == 'refs\/heads\/main'/, `${file} ${j.name}: main guard`);
      assert.doesNotMatch(cond, /refs\/tags/, `${file} ${j.name}: no tag refs`);
    }
    const deploy = jobs.find((j) => j.name === 'deploy');
    assert.match(jobIf(deploy), /inputs\.dry_run == false/, file);
    assert.match(stripComments(deploy.text), /needs: verify/, file);
  }
});

test('deploy workflows: only the gated job has the environment and the secrets, and no tag code runs there', async () => {
  for (const [file, { environment }] of Object.entries(DEPLOYS)) {
    const jobs = splitJobs(await text(file));
    for (const j of jobs) {
      const code = stripComments(j.text);
      if (j.name === 'deploy') {
        assert.match(code, new RegExp(`^ {4}environment: ${environment}$`, 'm'), file);
        // The job with secrets never rebuilds (the rebuild executes the tag's own code).
        assert.doesNotMatch(code, /rebuild_here/, `${file}: rebuild in the secrets job`);
        assert.match(code, /expected_hashes: \$\{\{ needs\.verify\.outputs\.hashes \}\}/, file);
      } else {
        assert.doesNotMatch(code, /environment:/, `${file} ${j.name}`);
        assert.doesNotMatch(code, /secrets\./, `${file} ${j.name}`);
      }
    }
    assert.match(
      stripComments(jobs[0].text),
      /rebuild_here: 'true'/,
      `${file}: rebuild runs in verify`,
    );
  }
  // Generic rule: any job that uses a secret other than GITHUB_TOKEN declares an environment.
  for (const f of await files()) {
    if (!f.isWorkflow) continue;
    for (const j of splitJobs(await readFile(join(ROOT, f.path), 'utf8'))) {
      const code = stripComments(j.text);
      const usesSecret = [...code.matchAll(/secrets\.(\w+)/g)].some((m) => m[1] !== 'GITHUB_TOKEN');
      if (usesSecret) assert.match(code, /^ {4}environment: /m, `${f.path} ${j.name}`);
    }
  }
});

test('every job that runs fetch-release can read attestations, nothing else is widened', async () => {
  for (const file of Object.keys(DEPLOYS)) {
    for (const j of splitJobs(await text(file))) {
      const code = stripComments(j.text);
      assert.ok(code.includes('uses: ./.github/actions/fetch-release'), `${file} ${j.name}`);
      assert.match(
        code,
        /permissions:\n {6}contents: read\n {6}actions: read\n {6}attestations: read\n/,
        `${file} ${j.name}: permissions`,
      );
      assert.doesNotMatch(code, /: write/, `${file} ${j.name}`);
    }
  }
});

test('deploy workflows: nothing is sent before the release files are verified', async () => {
  for (const [file, { send }] of Object.entries(DEPLOYS)) {
    for (const j of splitJobs(await text(file))) {
      const code = stripComments(j.text);
      const fetchAt = code.indexOf('uses: ./.github/actions/fetch-release');
      assert.ok(fetchAt > 0, `${file} ${j.name}: fetch-release step`);
      // The first step after fetch-release that runs a script sends or prints; it must come later.
      const runAt = code.search(/^ {8}run: /m);
      assert.ok(
        runAt === -1 || runAt > fetchAt,
        `${file} ${j.name}: no run step before verification`,
      );
      const sendAt = code.indexOf(send);
      assert.ok(sendAt === -1 || fetchAt < sendAt, `${file} ${j.name}: verify before use`);
      assert.match(code, /verify: \$\{\{ inputs\.verify \}\}/, `${file} ${j.name}`);
      assert.match(code, /attestations_off: \$\{\{ vars\.ATTESTATIONS \}\}/, `${file} ${j.name}`);
    }
  }
});

test('fetch-release: mandatory proof, exact signer identity, rebuild only in the secret-free job', async () => {
  const raw = await readFile(join(ROOT, '.github/actions/fetch-release/action.yml'), 'utf8');
  const action = stripComments(raw);
  assert.match(action, /sha256sum --check SHA256SUMS/);
  assert.match(action, /shasum -a 256 -c SHA256SUMS/);
  assert.match(action, /verify must be attestation or rebuild/);
  assert.doesNotMatch(action, /continue-on-error/);
  assert.doesNotMatch(action, /\|\|\s*true/, 'no failure is swallowed');
  // Attestation: exact certificate identity incl. the tag ref, issuer, tag, commit, hosted runners.
  assert.match(
    action,
    /--cert-identity "https:\/\/github\.com\/\$GITHUB_REPOSITORY\/\.github\/workflows\/release\.yml@refs\/tags\/\$TAG"/,
  );
  assert.match(action, /--cert-oidc-issuer "https:\/\/token\.actions\.githubusercontent\.com"/);
  assert.match(action, /--source-ref "refs\/tags\/\$TAG"/);
  assert.match(action, /--source-digest "\$SOURCE_SHA"/);
  assert.match(action, /--deny-self-hosted-runners/);
  assert.match(action, /for file in \.\/\*\.zip SHA256SUMS release-manifest\.json/);
  // Rebuild is only allowed with ATTESTATIONS=off, only executes where rebuild_here is true, and
  // the job with secrets must compare hashes instead.
  assert.match(action, /ATTESTATIONS is off/);
  for (const step of [
    'Check out the release tag for the rebuild',
    'Require the tag to be the released commit on main',
    'Set up the pinned Node version for the rebuild',
    'Rebuild and compare',
  ]) {
    const at = action.indexOf(`name: ${step}`);
    assert.ok(at > 0, step);
    assert.match(
      action.slice(at, at + 200),
      /if: \$\{\{ inputs\.verify == 'rebuild' && inputs\.rebuild_here == 'true' \}\}/,
      step,
    );
  }
  assert.match(action, /git merge-base --is-ancestor HEAD origin\/main/);
  assert.match(action, /fetch-depth: 0/);
  assert.match(action, /node scripts\/verify-rebuild\.mjs --tag "\$TAG" --dir "\$DIR"/);
  assert.match(action, /node-version-file: rebuild-src\/\.nvmrc/);
  assert.match(
    action,
    /inputs\.expected_hashes != '' \|\| \(inputs\.verify == 'rebuild' && inputs\.rebuild_here != 'true'\)/,
  );
  // Version, tag and hashes are validated with anchored bash regexes before $GITHUB_OUTPUT.
  assert.doesNotMatch(action, /grep -Eq/, 'line-based grep would accept multi-line values');
  const validate = action.indexOf('release-manifest.json has no valid version');
  assert.ok(validate > 0 && validate < action.indexOf('>> "$GITHUB_OUTPUT"'));
  assert.match(action, /\[\[ "\$version" =~ \$semver \]\]/);
  assert.match(action, /does not match tag/);
  // A run id must be a successful tag push of release.yml, built from this repo at the tag commit.
  assert.match(action, /\.github\/workflows\/release\.yml/);
  assert.match(action, /"\$run_event" == "push"/);
  assert.match(action, /\.head_sha, \.head_repository\.full_name/);
  assert.match(action, /"\$run_sha" == "\$source_sha"/);
  assert.match(action, /"\$run_repo" == "\$GITHUB_REPOSITORY"/);
});

test('release.yml: version and tag use anchored bash regexes; no extra git fetch', async () => {
  const r = stripComments(await text('release.yml'));
  assert.doesNotMatch(r, /grep -Eq/);
  assert.match(r, /\[\[ "\$REF_NAME" =~ \$tagre \]\]/);
  assert.match(r, /\[\[ "\$version" =~ \$semver \]\]/);
  assert.doesNotMatch(r, /git fetch/);
  assert.match(r, /fetch-depth: 0/);
  assert.match(r, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
});

test('.nvmrc pins an exact Node version', async () => {
  assert.match((await readFile(join(ROOT, '.nvmrc'), 'utf8')).trim(), /^\d+\.\d+\.\d+$/);
});

test('security files exist', async () => {
  for (const p of [
    'dependabot.yml',
    'CODEOWNERS',
    'workflows/codeql.yml',
    'workflows/dependency-review.yml',
  ]) {
    assert.ok((await readFile(join(ROOT, '.github', p), 'utf8')).length > 0, p);
  }
  const dep = await readFile(join(ROOT, '.github/dependabot.yml'), 'utf8');
  assert.match(dep, /package-ecosystem: npm/);
  assert.match(dep, /package-ecosystem: github-actions/);
  assert.match(dep, /interval: weekly/);
  assert.match(await readFile(join(ROOT, '.github/CODEOWNERS'), 'utf8'), /@Abhinavlvs/);
});

test('linter: untrusted contexts, github-script blocks and flow-style steps', () => {
  const run = (v) => wf(`      - run: echo "\${{ ${v} }}"\n`);
  for (const v of [
    'github.ref_name',
    'vars.X',
    'env.X',
    'steps.a.outputs.b',
    'needs.a.outputs.b',
    'inputs.a',
    'secrets.A',
  ]) {
    assert.equal(lintWorkflow(run(v)).errors.length, 1, v);
  }
  assert.deepEqual(lintWorkflow(run('matrix.node')).errors, []);
  const script = wf(
    '      - uses: ./x\n        with:\n          script: |\n            core.info("${{ steps.a.outputs.b }}")\n',
  );
  assert.match(lintWorkflow(script).errors.join(), /steps\.a\.outputs/);
  assert.match(
    lintWorkflow(wf('      - { uses: actions/checkout@v4 }\n')).errors.join(),
    /flow-style/,
  );
  assert.match(lintWorkflow(wf('      - "uses": ./x\n')).errors.join(), /quoted key/);
});

test('linter: top-level permissions must be read-only', () => {
  const mk = (p) => `name: t\non: push\n${p}\njobs: {}\n`;
  assert.deepEqual(lintWorkflow(mk('permissions: {}')).errors, []);
  assert.deepEqual(lintWorkflow(mk('permissions: read-all')).errors, []);
  assert.deepEqual(lintWorkflow(mk('permissions:\n  contents: read\n  actions: none')).errors, []);
  assert.match(
    lintWorkflow(mk('permissions:\n  contents: write')).errors.join(),
    /must be read or none/,
  );
  assert.match(lintWorkflow(mk('permissions: write-all')).errors.join(), /read-only/);
});

test('splitJobs does not need name first and ignores nested keys', () => {
  const text = `name: t\njobs:\n  alpha:\n    runs-on: x\n    name: A\n    steps:\n      - run: a\n  beta:\n    steps: []\n`;
  assert.deepEqual(
    splitJobs(text).map((j) => j.name),
    ['alpha', 'beta'],
  );
  assert.ok(splitJobs(text)[0].text.includes('run: a'));
  assert.deepEqual(splitJobs('name: t\n'), []);
});
