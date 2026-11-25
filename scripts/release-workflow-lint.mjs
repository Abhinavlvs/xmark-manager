/**
 * Tolerant, line-based checker for the few GitHub Actions invariants this repo relies on. It is NOT
 * a YAML parser and NOT a replacement for actionlint (see docs/RELEASING.md); it only guards:
 *
 *  1. a top-level `permissions:` block exists (workflows only, not composite actions)
 *  2. `pull_request_target` is never used
 *  3. every `uses:` is a local path or `owner/repo[/path]@<40 hex>`; `@PIN_ME` is a placeholder for
 *     a new action whose SHA is not looked up yet: reported separately (see `unpinned`), and the
 *     test fails on it when REQUIRE_PINNED=1 (set in ci.yml and release.yml)
 *  4. every `actions/checkout` step sets `persist-credentials: false`
 *  5. workflows triggered by `pull_request` reference no secrets other than GITHUB_TOKEN
 *  6. `run:` scripts and github-script `script:` blocks do not interpolate `inputs.*`,
 *     `github.event.*`, `github.head_ref`, `github.ref_name`, `secrets.*`, `vars.*`, `env.*`,
 *     `steps.*.outputs` or `needs.*.outputs` directly (pass them through `env:` instead: script
 *     injection / secret leakage)
 *  7. no tab characters (YAML forbids them for indentation)
 *  8. the top-level `permissions:` is read-only (`{}`, `read-all`, or only `read`/`none` entries)
 *  9. fail closed on what this line-based reader cannot parse: flow-style steps (`- {uses: x}`)
 *     and quoted `uses`/`run`/`script`/`environment` keys
 */

const SHA = /^[0-9a-f]{40}$/;
const USES = /^(\s*)(-\s+)?uses:\s*([^\s#]+)/;

const UNTRUSTED =
  /\$\{\{\s*(inputs\.|github\.event\.|github\.head_ref|github\.ref_name|secrets\.|vars\.|env\.|steps\.[\w-]+\.outputs|needs\.[\w-]+\.outputs)/;

const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === '' || line.trim().startsWith('#');

/**
 * @param {string} text file content
 * @param {{isWorkflow?: boolean}} [options] `isWorkflow: false` for composite actions
 * @returns {{errors: string[], unpinned: string[]}}
 */
export function lintWorkflow(text, { isWorkflow = true } = {}) {
  const errors = [];
  const unpinned = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const code = lines.map((l) => (l.trimStart().startsWith('#') ? '' : l));

  if (lines.some((l) => l.includes('\t'))) errors.push('tab character found');

  if (isWorkflow) {
    const at = code.findIndex((l) => /^permissions:/.test(l));
    if (at === -1) errors.push('missing top-level `permissions:` block');
    else errors.push(...topLevelPermissionErrors(code, at));
  }

  code.forEach((l, i) => {
    if (/^\s*-\s*\{.*\b(uses|run|script)\b/.test(l)) {
      errors.push(
        `line ${i + 1}: flow-style step is not supported by the checker; use block style`,
      );
    }
    if (/^\s*(-\s+)?["'](uses|run|script|environment|permissions)["']\s*:/.test(l)) {
      errors.push(`line ${i + 1}: quoted key is not supported by the checker; unquote it`);
    }
  });

  code.forEach((l, i) => {
    if (/\bpull_request_target\b/.test(l))
      errors.push(`line ${i + 1}: pull_request_target is forbidden`);
  });

  code.forEach((l, i) => {
    const m = USES.exec(l);
    if (!m) return;
    const ref = m[3].replace(/^['"]|['"]$/g, '');
    if (ref.startsWith('./')) return;
    const at = ref.lastIndexOf('@');
    const rev = at === -1 ? '' : ref.slice(at + 1);
    if (ref.startsWith('docker://') || at === -1 || !(SHA.test(rev) || rev === 'PIN_ME')) {
      errors.push(`line ${i + 1}: \`uses: ${ref}\` is not pinned to a 40-character commit SHA`);
    } else if (rev === 'PIN_ME') {
      unpinned.push(ref.slice(0, at));
    }
    if (
      /^actions\/checkout@/.test(ref) &&
      !stepBlock(code, i).some((s) => /persist-credentials:\s*false\b/.test(s))
    ) {
      errors.push(`line ${i + 1}: actions/checkout step lacks \`persist-credentials: false\``);
    }
  });

  if (isWorkflow && triggersOnPullRequest(code)) {
    code.forEach((l, i) => {
      for (const m of l.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
        if (m[1] !== 'GITHUB_TOKEN') {
          errors.push(
            `line ${i + 1}: secrets.${m[1]} used in a workflow triggered by pull_request`,
          );
        }
      }
    });
  }

  for (const { index, line } of runLines(code)) {
    const bad = UNTRUSTED.exec(line);
    if (bad) {
      errors.push(
        `line ${index + 1}: \`${bad[1]}\` interpolated in a run script; pass it via env:`,
      );
    }
  }

  return { errors, unpinned: [...new Set(unpinned)].sort() };
}

/** Lines of the YAML list item (step) that contains line `i`. */
function stepBlock(code, i) {
  const m = USES.exec(code[i]);
  const dashIndent = m[2] ? m[1].length : m[1].length - 2;
  let start = i;
  if (!m[2]) {
    while (start > 0 && !new RegExp(`^ {${dashIndent}}- `).test(code[start])) start--;
  }
  let end = i + 1;
  while (end < code.length) {
    const l = code[end];
    if (!isBlank(l) && indentOf(l) <= dashIndent) break;
    end++;
  }
  return code.slice(start, end);
}

function triggersOnPullRequest(code) {
  const start = code.findIndex((l) => /^(on|'on'|"on"):/.test(l));
  if (start === -1) return false;
  let end = start + 1;
  while (end < code.length && (isBlank(code[end]) || indentOf(code[end]) > 0)) end++;
  const block = code.slice(start, end).join('\n');
  return /(^|[\s[,])pull_request(?!_target)\b/m.test(block);
}

/** Every line that belongs to a `run:` or `script:` body (single-line value or block scalar body). */
function runLines(code) {
  const out = [];
  for (let i = 0; i < code.length; i++) {
    const m = /^(\s*)(?:-\s+)?(?:run|script):\s*(.*)$/.exec(code[i]);
    if (!m) continue;
    const keyIndent = m[1].length + (/^\s*-\s+(?:run|script):/.test(code[i]) ? 2 : 0);
    if (m[2] && !/^[|>][+-]?\d*$/.test(m[2])) {
      out.push({ index: i, line: m[2] });
      continue;
    }
    for (let j = i + 1; j < code.length; j++) {
      if (!isBlank(code[j]) && indentOf(code[j]) <= keyIndent) break;
      out.push({ index: j, line: code[j] });
    }
  }
  return out;
}

function topLevelPermissionErrors(code, at) {
  const errors = [];
  const inline = /^permissions:\s*(\S.*)?$/.exec(code[at])[1];
  if (inline) {
    if (!['{}', 'read-all'].includes(inline.trim())) {
      errors.push(
        `line ${at + 1}: top-level permissions must be {} or read-all or a read-only block`,
      );
    }
    return errors;
  }
  for (let i = at + 1; i < code.length && (isBlank(code[i]) || indentOf(code[i]) > 0); i++) {
    const m = /^\s+([\w-]+):\s*(\S+)/.exec(code[i]);
    if (m && !['read', 'none'].includes(m[2])) {
      errors.push(`line ${i + 1}: top-level permission ${m[1]}: ${m[2]} must be read or none`);
    }
  }
  return errors;
}

/**
 * Splits a workflow into jobs: every 2-space-indented key directly under `jobs:` starts one (it
 * does not rely on `name:` being the first key).
 * @returns {{name: string, text: string}[]}
 */
export function splitJobs(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start === -1) return [];
  const jobs = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() !== '' && indentOf(lines[i]) === 0 && !lines[i].startsWith('#')) break;
    const m = /^ {2}(["']?)([\w-]+)\1:\s*$/.exec(lines[i]);
    if (m) jobs.push({ name: m[2], lines: [lines[i]] });
    else if (jobs.length) jobs[jobs.length - 1].lines.push(lines[i]);
  }
  return jobs.map((j) => ({ name: j.name, text: j.lines.join('\n') }));
}
