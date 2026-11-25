/**
 * Data model and defensive normalization. Pure: no browser APIs, no I/O.
 */

/**
 * @typedef {{id: string, name: string, updated_at: string, deleted: boolean}} Folder
 */

/**
 * @typedef {{
 *   id: string,
 *   url: string,
 *   author: string|null,
 *   text_preview: string,
 *   folder_id: string|null,
 *   tags: string[],
 *   notes: string,
 *   created_at: string,
 *   updated_at: string,
 *   deleted: boolean,
 * }} Post
 */

/**
 * @typedef {{version: 1, folders: Folder[], posts: Post[]}} Doc
 */

import { SNIPPET_MAX } from './snippet.js';

export const DOC_VERSION = 1;

export const MAX_NOTES = 5000;
export const MAX_PREVIEW = SNIPPET_MAX;
export const MAX_FOLDER_NAME = 80;
export const MAX_ID = 64;
const MAX_URL = 2048;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const EPOCH = '1970-01-01T00:00:00.000Z';

/** @returns {Doc} */
export function emptyDocument() {
  return { version: DOC_VERSION, folders: [], posts: [] };
}

/**
 * Trim, lowercase, dedupe, drop empties; max 20 tags of 40 chars.
 * @param {unknown} tags
 * @returns {string[]}
 */
export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const t = tag.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (t && !out.includes(t)) out.push(t);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v) => typeof v === 'string' && v.length > 0;
/** Return `v` if it is a string (else `fallback`), clamped to `max` chars. */
const cleanString = (v, fallback, max) => (typeof v === 'string' ? v : fallback).slice(0, max);
/** Canonical full ISO string for a valid date string, else `fallback`. */
function cleanTimestamp(v, fallback = EPOCH) {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return fallback;
  return new Date(v).toISOString();
}

/** Keep one record per id: newest updated_at, ties by larger JSON (order-independent). */
function dedupeById(records) {
  const byId = new Map();
  for (const rec of records) {
    const prev = byId.get(rec.id);
    if (!prev || isNewer(rec, prev)) byId.set(rec.id, rec);
  }
  return [...byId.values()];
}

function isNewer(a, b) {
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at;
  return JSON.stringify(a) > JSON.stringify(b);
}

/** @returns {Folder|null} */
export function normalizeFolder(raw) {
  if (!isObject(raw) || !isId(raw.id) || typeof raw.name !== 'string') return null;
  return {
    id: raw.id,
    name: raw.name.slice(0, MAX_FOLDER_NAME),
    updated_at: cleanTimestamp(raw.updated_at),
    deleted: raw.deleted === true,
  };
}

/** @returns {Post|null} */
export function normalizePost(raw) {
  if (!isObject(raw) || !isId(raw.id) || typeof raw.url !== 'string') return null;
  if (raw.tags !== undefined && !Array.isArray(raw.tags)) return null;
  const updatedAt = cleanTimestamp(raw.updated_at);
  return {
    id: raw.id,
    url: raw.url.slice(0, MAX_URL),
    author: typeof raw.author === 'string' ? raw.author : null,
    text_preview: cleanString(raw.text_preview, '', MAX_PREVIEW),
    folder_id: isId(raw.folder_id) ? raw.folder_id : null,
    tags: normalizeTags(raw.tags),
    notes: cleanString(raw.notes, '', MAX_NOTES),
    created_at: cleanTimestamp(raw.created_at, updatedAt),
    updated_at: updatedAt,
    deleted: raw.deleted === true,
  };
}

/**
 * v1 reader: drops malformed records (counted in `dropped`), dedupes by id.
 * Throws only on a wrong shape.
 */
function readV1(raw) {
  const folders = raw.folders.map(normalizeFolder).filter(Boolean);
  const posts = raw.posts.map(normalizePost).filter(Boolean);
  const dropped = raw.folders.length - folders.length + (raw.posts.length - posts.length);
  return {
    doc: { version: DOC_VERSION, folders: dedupeById(folders), posts: dedupeById(posts) },
    dropped,
  };
}

/** One entry per stored schema version; each returns a document at the current version. */
const MIGRATIONS = Object.freeze({ 1: readV1 });

const refuse = (reason) => ({ doc: emptyDocument(), ok: false, reason, dropped: 0 });

/**
 * Read a stored document of any known schema version. Never throws, never mutates `raw`.
 * An unknown (future) version or a wrong shape is refused with a short `reason` so the caller
 * can keep the raw value instead of overwriting it. A missing version with a recognisable
 * shape is accepted as v1 only when every record is valid. When a versioned document is read
 * but some records had to be dropped, `ok` stays true, `reason` is `records_dropped` and
 * `dropped` counts them, so the caller can keep the raw value before anything is saved.
 * @param {unknown} raw
 * @returns {{doc: Doc, ok: boolean, reason: string|null, dropped: number}}
 */
export function migrate(raw) {
  try {
    if (!isObject(raw)) return refuse('not_object');
    const { version } = raw;
    const step = typeof version === 'number' ? MIGRATIONS[version] : undefined;
    if (version !== undefined && !step) return refuse('unknown_version');
    if (!Array.isArray(raw.folders) || !Array.isArray(raw.posts)) return refuse('bad_shape');
    if (version === undefined) {
      const clean = raw.folders.every(normalizeFolder) && raw.posts.every(normalizePost);
      if (!clean) return refuse('bad_records');
    }
    const { doc, dropped } = (step ?? MIGRATIONS[DOC_VERSION])(raw);
    return { doc, ok: true, reason: dropped > 0 ? 'records_dropped' : null, dropped };
  } catch {
    return refuse('bad_shape');
  }
}

/**
 * Defensive document normalization (see `migrate`); `ok` is false when the data was refused.
 * @param {unknown} raw
 * @returns {{doc: Doc, ok: boolean}}
 */
export function normalizeDocument(raw) {
  const { doc, ok } = migrate(raw);
  return { doc, ok };
}
