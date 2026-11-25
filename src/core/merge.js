/**
 * Document merge for sync and import. Pure: no browser APIs, no I/O.
 */
import { mergeRecords } from './merge-records.js';
import { collapseLive } from './post-identity.js';

export const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

/**
 * Keep one live post per status id (newest wins); tombstone the rest at `now`.
 * @param {import('./model.js').Post[]} posts
 * @param {string} now
 * @returns {import('./model.js').Post[]}
 */
function dedupeLivePosts(posts, now) {
  const { winners, losers } = collapseLive(posts.filter((p) => !p.deleted));
  const won = new Map(winners.map((p) => [p.id, p]));
  const lost = new Set(losers.map((p) => p.id));
  return posts.map((post) => {
    if (post.deleted) return post;
    if (lost.has(post.id)) {
      return { ...post, notes: '', tags: [], text_preview: '', deleted: true, updated_at: now };
    }
    return won.get(post.id) ?? post;
  });
}

// Note: purging an expired tombstone can resurrect an older live copy held by a
// peer that never saw the deletion. Accepted as inherent to TTL-based purging.

/**
 * Merge two documents into a new one. Commutative and idempotent; never mutates its inputs.
 * Not guaranteed associative: duplicates of one status id are collapsed after each pairwise
 * merge, so the order in which three or more documents are merged can change which duplicate
 * survives. Posts keep their `folder_id` even if the folder
 * is tombstoned or absent (the UI treats that as uncategorised).
 * @param {import('./model.js').Doc} local
 * @param {import('./model.js').Doc} remote
 * @param {{now: string, tombstoneTtlMs: number}} opts
 * @returns {import('./model.js').Doc}
 */
export function mergeDocuments(local, remote, opts) {
  const posts = mergeRecords(local.posts, remote.posts, opts);
  return {
    version: 1,
    folders: mergeRecords(local.folders, remote.folders, opts),
    posts: dedupeLivePosts(posts, opts.now),
  };
}
