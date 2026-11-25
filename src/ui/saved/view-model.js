/**
 * Pure view-model helpers shared by the popup and the options Saved page. No DOM, no browser APIs.
 */

import { parsePostUrl } from '../../core/url.js';
import { normalizeTags } from '../../core/model.js';
import { relativeTime } from '../time.js';
import { describeError } from '../errors.js';
import { countPosts } from '../../core/counts.js';

export const UNCATEGORISED = 'Uncategorised';
const MAX_DISPLAY_URL = 36;

/** @typedef {import('../../core/model.js').Folder} Folder */
/** @typedef {import('../../core/model.js').Post} Post */

const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/**
 * Split on comma/whitespace, strip leading `#`, normalize (lowercase, dedupe, max 20).
 * @param {string} text
 * @returns {string[]}
 */
export function parseTagInput(text) {
  const parts = String(text ?? '')
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, ''));
  return normalizeTags(parts);
}

/**
 * @param {Folder[]} folders
 * @param {{total: number, none: number, byId: Record<string, number>}} counts
 * @returns {{id: string|null|undefined, label: string, count: number}[]}
 */
export function folderChips(folders, counts) {
  return [
    { id: undefined, label: 'All', count: counts.total },
    { id: null, label: UNCATEGORISED, count: counts.none },
    ...[...folders]
      .sort(byName)
      .map((f) => ({ id: f.id, label: f.name, count: counts.byId[f.id] ?? 0 })),
  ];
}

function shortenUrl(url) {
  const bare = url.replace(/^https?:\/\/(www\.)?/, '');
  return bare.length > MAX_DISPLAY_URL ? `${bare.slice(0, MAX_DISPLAY_URL - 2)}…` : bare;
}

/**
 * @param {Post} post
 * @param {Date} now
 * @param {Folder[]} [folders]
 */
export function describePost(post, now, folders = []) {
  const folder = post.folder_id === null ? null : folders.find((f) => f.id === post.folder_id);
  return {
    title: post.author ? `@${post.author}` : 'Post',
    subtitle: post.text_preview || post.notes || '',
    displayUrl: shortenUrl(post.url),
    tags: post.tags,
    folderLabel: folder ? folder.name : UNCATEGORISED,
    savedAgo: relativeTime(post.created_at, now),
  };
}

const EMPTY = {
  library: {
    title: 'Nothing saved yet',
    body: 'Open a post on X, click the toolbar button, and save it to start your library.',
  },
  'no-results': {
    title: 'No matching posts',
    body: 'Try a different search or clear the filters.',
  },
  error: {
    title: 'Could not load your posts',
    body: 'Something went wrong talking to the extension. Try again.',
  },
};

/** @param {'library'|'no-results'|'error'} kind */
export function emptyStateFor(kind) {
  return EMPTY[kind] ?? EMPTY.error;
}

/**
 * The only URL the UI will open in a tab: the canonical https x.com post URL, else null.
 * @param {unknown} url
 * @returns {string|null}
 */
export function safeOpenTarget(url) {
  return parsePostUrl(url)?.url ?? null;
}

export { describeError, countPosts, relativeTime };
