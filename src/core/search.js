/**
 * Pure post filtering. Never mutates its input.
 */

import { normalizeTags } from './model.js';

/**
 * @typedef {import('./model.js').Post} Post
 * @typedef {{text?: string, folderId?: string|null, tag?: string}} PostQuery
 */

/**
 * @param {Post} post
 * @param {string} needle lowercased, non-empty
 */
function matchesText(post, needle) {
  const fields = [post.url, post.author ?? '', post.notes, post.text_preview, ...post.tags];
  return fields.some((f) => f.toLowerCase().includes(needle));
}

/**
 * @param {Post[]} posts
 * @param {PostQuery} q
 * @returns {Post[]}
 */
export function filterPosts(posts, q = {}) {
  const needle = typeof q.text === 'string' ? q.text.trim().toLowerCase() : '';
  const [tag] = normalizeTags([q.tag]);
  return posts.filter((p) => {
    if (q.folderId !== undefined && p.folder_id !== q.folderId) return false;
    if (typeof q.tag === 'string' && !(tag && p.tags.includes(tag))) return false;
    return !needle || matchesText(p, needle);
  });
}
