/**
 * Pure helpers for browsing a whole library in memory: sorting, counting and paging.
 * Never mutates its input.
 */

import { countPosts } from './counts.js';

/** @typedef {import('./model.js').Post} Post */
/** @typedef {import('./model.js').Folder} Folder */

export const PAGE_SIZE = 50;
export const SORT_ORDERS = ['newest', 'oldest', 'author'];

const time = (p) => (typeof p.created_at === 'string' ? p.created_at : '');
const newestFirst = (a, b) => (time(a) < time(b) ? 1 : time(a) > time(b) ? -1 : 0);

const COMPARE = {
  newest: newestFirst,
  oldest: (a, b) => -newestFirst(a, b),
  author(a, b) {
    const x = (a.author ?? '').toLowerCase();
    const y = (b.author ?? '').toLowerCase();
    if (!x !== !y) return x ? -1 : 1; // posts without an author go last
    return x < y ? -1 : x > y ? 1 : newestFirst(a, b);
  },
};

/**
 * @param {Post[]} posts
 * @param {'newest'|'oldest'|'author'} [order]
 */
export function sortPosts(posts, order = 'newest') {
  return [...posts].sort(COMPARE[order] ?? COMPARE.newest);
}

/** @param {Post[]} posts @returns {{tag: string, count: number}[]} most used first */
export function tagCounts(posts) {
  const counts = new Map();
  for (const p of posts) for (const tag of p.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

/**
 * Posts whose folder no longer exists are shown as Uncategorised.
 * @param {Post[]} posts
 * @param {Folder[]} folders
 */
export function adoptOrphans(posts, folders) {
  const known = new Set(folders.map((f) => f.id));
  return posts.map((p) =>
    p.folder_id === null || known.has(p.folder_id) ? p : { ...p, folder_id: null },
  );
}

/** Per-folder counts where orphan folder ids count as Uncategorised. */
export function folderCounts(posts, folders) {
  return countPosts(adoptOrphans(posts, folders));
}

/**
 * The first `pages` pages of `items`.
 * @template T
 * @param {T[]} items
 * @param {number} pages
 * @param {number} [size]
 */
export function visibleSlice(items, pages, size = PAGE_SIZE) {
  const shown = Math.min(items.length, Math.max(1, pages) * size);
  return {
    items: items.slice(0, shown),
    total: items.length,
    hasMore: shown < items.length,
    remaining: items.length - shown,
  };
}
