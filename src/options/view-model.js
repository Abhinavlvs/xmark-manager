/**
 * Pure view-model helpers for the options page. No DOM, no browser APIs.
 */

import { countPosts } from '../core/counts.js';

const pad = (n) => String(n).padStart(2, '0');

/** @param {Date} date */
export function exportFilename(date) {
  return `xmark-manager-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * @param {{id: string, name: string}[]} folders
 * @param {{folder_id: string|null}[]} posts
 */
export function folderRows(folders, posts) {
  const counts = countPosts(posts);
  const rows = folders
    .map((f) => ({ id: f.id, name: f.name, count: counts.byId[f.id] ?? 0 }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return { rows, uncategorised: counts.none };
}

/** @param {string} name @param {number} count */
export function deleteFolderMessage(name, count) {
  const tail =
    count === 0
      ? 'No posts are in it.'
      : `Its ${count} ${count === 1 ? 'post' : 'posts'} will become Uncategorised. The posts are not deleted.`;
  return `Delete "${name}"? ${tail}`;
}

const records = (n) => `${n} ${n === 1 ? 'record' : 'records'}`;

const REASON = 'because the file could not prove it is newer.';

const noun = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Why some posts and folders were left as they are on this device (empty text for zero). */
export function keptLocalText(posts, future = false, folders = 0) {
  const parts = [];
  if (posts) parts.push(noun(posts, 'post', 'posts'));
  if (folders) parts.push(noun(folders, 'folder', 'folders'));
  if (parts.length === 0) return '';
  const one = posts + folders === 1;
  const verb = future ? 'will be kept' : one ? 'was kept' : 'were kept';
  return `${parts.join(' and ')} ${verb} as ${one ? 'it is' : 'they are'} on this device ${REASON}`;
}

/** @param {{added: number, updated: number, removed: number, unchanged: number, rejected?: number, keptLocal?: number}} r */
export function importSummaryText(r) {
  const base = `Import finished: ${r.added} added, ${r.updated} updated, ${r.removed} removed, ${r.unchanged} unchanged.`;
  const skipped = r.rejected
    ? ` ${r.rejected} invalid ${r.rejected === 1 ? 'record was' : 'records were'} skipped.`
    : '';
  const keptText = keptLocalText(r.keptLocal ?? 0, false, r.keptLocalFolders ?? 0);
  const kept = keptText ? ` ${keptText}` : '';
  return `${base}${skipped}${kept}`;
}

/** Text for the confirmation shown after a dry run. */
export function importPreviewText(r) {
  const folders = r.foldersChanged
    ? ` It also changes ${r.foldersChanged} ${r.foldersChanged === 1 ? 'folder' : 'folders'}.`
    : '';
  const keptFuture = keptLocalText(r.keptLocal ?? 0, true, r.keptLocalFolders ?? 0);
  return `This import will add ${r.added}, change ${r.updated} and remove ${r.removed} posts (${records(r.rejected ?? 0)} skipped as invalid).${folders}${keptFuture ? ` ${keptFuture}` : ''} Nothing is changed until you continue.`;
}
