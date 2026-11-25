/**
 * Validation of untrusted import records, beyond shape normalization. Pure.
 * Posts must have a canonical X URL; ids are capped; folder names are cleaned and kept unique.
 */

import { normalizePost, normalizeFolder, MAX_ID, MAX_FOLDER_NAME } from './model.js';
import { parsePostUrl } from './url.js';
import { cleanFolderName } from './folder-name.js';
import { isNewer } from './merge-records.js';
import { collapseLive } from './post-identity.js';

const lower = (s) => s.toLowerCase();

/** Keep the newest record per key; count the losers as merged. */
function newestBy(records, keyOf) {
  const winners = new Map();
  let merged = 0;
  for (const rec of records) {
    const key = keyOf(rec);
    const prev = winners.get(key);
    if (prev) merged += 1;
    if (!prev || isNewer(rec, prev)) winners.set(key, rec);
  }
  return { list: [...winners.values()], merged };
}

function cleanPost(raw) {
  const post = normalizePost(raw);
  const parsed = post && parsePostUrl(post.url);
  if (!parsed || post.id.length > MAX_ID) return null;
  if (post.folder_id !== null && post.folder_id.length > MAX_ID) return null;
  const clean = { ...post, url: parsed.url, author: parsed.author };
  return clean.deleted ? { ...clean, notes: '', tags: [], text_preview: '' } : clean;
}

/** @returns {{posts: object[], rejected: number, merged: number}} */
export function cleanPosts(rawPosts) {
  const valid = [];
  let rejected = 0;
  for (const raw of rawPosts) {
    const post = cleanPost(raw);
    if (post) valid.push(post);
    else rejected += 1;
  }
  const byId = newestBy(valid, (p) => p.id);
  const live = collapseLive(byId.list.filter((p) => !p.deleted));
  const posts = [...byId.list.filter((p) => p.deleted), ...live.winners];
  return { posts, rejected, merged: byId.merged + live.losers.length };
}

function cleanFolder(raw) {
  const folder = normalizeFolder(raw);
  if (!folder || folder.id.length > MAX_ID) return null;
  if (folder.deleted) return folder;
  try {
    return { ...folder, name: cleanFolderName(folder.name) };
  } catch {
    return null;
  }
}

/**
 * Rename live folders whose name (case-insensitive) is already used, appending " (2)", " (3)".
 * Order is deterministic: oldest updated_at first, then id; the first keeps its name.
 * @param {{id: string, name: string, updated_at: string, deleted: boolean}[]} folders
 * @param {{id: string, name: string}[]} [others] existing folders the names must not clash with
 */
export function uniquifyFolders(folders, others = []) {
  const renamed = new Map();
  const live = folders
    .filter((f) => !f.deleted)
    .sort((a, b) =>
      a.updated_at === b.updated_at ? (a.id < b.id ? -1 : 1) : a.updated_at < b.updated_at ? -1 : 1,
    );
  const taken = new Set();
  for (const f of live) {
    const used = new Set([
      ...taken,
      ...others.filter((o) => o.id !== f.id).map((o) => lower(o.name)),
    ]);
    let name = f.name;
    for (let n = 2; used.has(lower(name)); n += 1) {
      const suffix = ` (${n})`;
      name = `${f.name.slice(0, MAX_FOLDER_NAME - suffix.length)}${suffix}`;
    }
    taken.add(lower(name));
    renamed.set(f.id, name);
  }
  return folders.map((f) => (renamed.has(f.id) ? { ...f, name: renamed.get(f.id) } : f));
}

/** Names are cleaned here but made unique later, once, by the repository merge. */
/** @returns {{folders: object[], rejected: number, merged: number}} */
export function cleanFolders(rawFolders) {
  const valid = [];
  let rejected = 0;
  for (const raw of rawFolders) {
    const folder = cleanFolder(raw);
    if (folder) valid.push(folder);
    else rejected += 1;
  }
  const byId = newestBy(valid, (f) => f.id);
  return { folders: byId.list, rejected, merged: byId.merged };
}
