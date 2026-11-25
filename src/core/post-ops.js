/**
 * Post mutations on a working copy of the document. Pure; callers save.
 */

import { parsePostUrl } from './url.js';
import { statusIdOf } from './post-identity.js';
import { normalizeTags, MAX_NOTES, MAX_PREVIEW } from './model.js';
import { InvalidPostUrlError, NotFoundError } from './errors.js';
import { assertLiveFolder } from './folder-ops.js';

const has = (o, k) => o !== null && typeof o === 'object' && o[k] !== undefined;
const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);

/** Apply allowed optional fields from `src` onto `post`. */
function applyFields(doc, post, src) {
  if (has(src, 'folderId')) {
    if (src.folderId !== null) assertLiveFolder(doc, src.folderId);
    post.folder_id = src.folderId;
  }
  if (has(src, 'tags')) post.tags = normalizeTags(src.tags);
  if (has(src, 'notes')) post.notes = str(src.notes, MAX_NOTES);
  if (has(src, 'textPreview')) post.text_preview = str(src.textPreview, MAX_PREVIEW);
}

/** The newest save knows the handle (and its casing); keep the old URL only if it knows none. */
function adoptHandle(post, parsed) {
  if (parsed.author !== null) Object.assign(post, { url: parsed.url, author: parsed.author });
}

const blank = () => ({ folder_id: null, tags: [], notes: '', text_preview: '' });

export function upsertPost(doc, input, now, createId) {
  const parsed = parsePostUrl(input?.url);
  if (!parsed) throw new InvalidPostUrlError('Not a valid X post URL');
  const matches = doc.posts.filter((p) => statusIdOf(p.url) === parsed.id);
  const existing = matches.find((p) => !p.deleted) ?? matches[0];

  if (existing && !existing.deleted) {
    adoptHandle(existing, parsed);
    applyFields(doc, existing, input);
    existing.updated_at = now;
    return existing;
  }
  if (existing) {
    // Revive a tombstone with fresh fields, keeping its id and created_at.
    Object.assign(existing, blank(), { url: parsed.url, author: parsed.author });
    existing.deleted = false;
    applyFields(doc, existing, input);
    existing.updated_at = now;
    return existing;
  }
  const post = {
    id: createId(),
    url: parsed.url,
    author: parsed.author,
    ...blank(),
    created_at: now,
    updated_at: now,
    deleted: false,
  };
  applyFields(doc, post, input);
  doc.posts.push(post);
  return post;
}

export function patchPost(doc, id, patch, now) {
  const post = doc.posts.find((p) => p.id === id && !p.deleted);
  if (!post) throw new NotFoundError('Post not found');
  applyFields(doc, post, patch);
  post.updated_at = now;
  return post;
}

/** @returns {boolean} whether anything changed */
export function tombstonePost(doc, id, now) {
  const post = doc.posts.find((p) => p.id === id && !p.deleted);
  if (!post) return false;
  Object.assign(post, { notes: '', tags: [], text_preview: '' });
  post.deleted = true;
  post.updated_at = now;
  return true;
}
