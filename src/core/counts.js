/**
 * Post counting helpers. Pure.
 */

/** @typedef {import('./model.js').Post} Post */

/** @param {Post[]} posts */
export function countPosts(posts) {
  const counts = { total: posts.length, none: 0, byId: Object.create(null) };
  for (const p of posts) {
    if (p.folder_id === null) counts.none += 1;
    else counts.byId[p.folder_id] = (counts.byId[p.folder_id] ?? 0) + 1;
  }
  return counts;
}
