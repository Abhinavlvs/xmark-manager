/**
 * Export and import of the library as JSON. Pure: no browser APIs, no I/O.
 */
import { DOC_VERSION } from './model.js';
import { cleanPosts, cleanFolders } from './import-clean.js';

export const MAX_IMPORT_CHARS = 25 * 1024 * 1024;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * @param {import('./model.js').Doc} doc
 * @param {string} [exportedAt] ISO time of the export; imports use it to clamp future dates
 * @returns {string} compact JSON (`version`, then `exported_at` when given) and a trailing newline
 */
export function exportDocument(doc, exportedAt) {
  const { version, ...rest } = doc;
  const head = exportedAt ? { version, exported_at: exportedAt } : { version };
  return `${JSON.stringify({ ...head, ...rest })}\n`;
}

/** The file's own export time as a canonical ISO string, or null if absent or invalid. */
function readExportedAt(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

/**
 * Parse and clean an exported library. Never throws. `rejected` counts invalid records;
 * `merged` counts records folded into another one inside the file (same id or same post URL).
 * @param {unknown} text
 * @returns {{ok: true, doc: import('./model.js').Doc, rejected: number, merged: number, exportedAt: string|null} | {ok: false, error: string}}
 */
export function parseImport(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'empty' };
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, error: 'too_large' };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not_json' };
  }
  if (!isObject(raw) || raw.version !== DOC_VERSION)
    return { ok: false, error: 'unsupported_format' };
  if (!Array.isArray(raw.folders) || !Array.isArray(raw.posts)) {
    return { ok: false, error: 'unsupported_format' };
  }
  const folders = cleanFolders(raw.folders);
  const posts = cleanPosts(raw.posts);
  return {
    ok: true,
    doc: { version: DOC_VERSION, folders: folders.folders, posts: posts.posts },
    rejected: folders.rejected + posts.rejected,
    merged: folders.merged + posts.merged,
    exportedAt: readExportedAt(raw.exported_at),
  };
}

const isLive = (rec) => rec !== undefined && !rec.deleted;

/**
 * What a merge did to posts. `unchanged` counts only records that were in the file.
 * @param {import('./model.js').Doc} before
 * @param {import('./model.js').Doc} after
 * @param {import('./model.js').Doc} [imported] omit to treat every record as present in the file
 * @returns {{added: number, updated: number, removed: number, unchanged: number}}
 */
export function summarizeImport(before, after, imported) {
  const out = { added: 0, updated: 0, removed: 0, unchanged: 0 };
  const prior = new Map(before.posts.map((p) => [p.id, p]));
  const next = new Map(after.posts.map((p) => [p.id, p]));
  const inFile = imported ? new Set(imported.posts.map((p) => p.id)) : null;
  for (const id of new Set([...prior.keys(), ...next.keys()])) {
    const was = prior.get(id);
    const now = next.get(id);
    if (isLive(now) && !isLive(was)) out.added += 1;
    else if (isLive(was) && !isLive(now)) out.removed += 1;
    else if (isLive(now) && JSON.stringify(was) !== JSON.stringify(now)) out.updated += 1;
    else if (isLive(now) && (!inFile || inFile.has(id))) out.unchanged += 1;
  }
  return out;
}

/** Number of folder records that are new or different after a merge. */
export function countFolderChanges(before, after) {
  const prior = new Map(before.folders.map((f) => [f.id, JSON.stringify(f)]));
  return after.folders.filter((f) => prior.get(f.id) !== JSON.stringify(f)).length;
}
