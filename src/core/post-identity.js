/**
 * Post identity is the X status id, not the URL string: x.com/Alice/status/1,
 * twitter.com/alice/status/1, mobile.twitter.com/alice/status/1 and /i/web/status/1
 * are one post. Pure.
 */

import { parsePostUrl } from './url.js';
import { isNewer } from './merge-records.js';

/** The status id of a post URL, or null when the URL is not a post URL. */
export const statusIdOf = (url) => parsePostUrl(url)?.id ?? null;

/** Grouping key: the status id, or the raw URL for anything unparseable (never merged away). */
export const identityKey = (post) => statusIdOf(post.url) ?? `url:${post.url}`;

/**
 * Collapse live posts that share an identity to one, independent of input order: the newest
 * record that knows a handle (its id, URL and handle casing) wins; only when none does, the
 * newest `/i/web/` record. Last-writer-wins therefore applies among records with a handle, and a
 * newer handle-less duplicate is dropped rather than merged field by field. Content is never
 * synthesised, so merging the result again with its inputs gives the same result (idempotent,
 * commutative). The losers' notes, tags and folder are not kept.
 * @template {import('./model.js').Post} T
 * @param {T[]} live live (not deleted) posts only
 * @returns {{winners: T[], losers: T[]}}
 */
export function collapseLive(live) {
  const groups = new Map();
  for (const post of live) {
    const key = identityKey(post);
    const group = groups.get(key);
    if (group) group.push(post);
    else groups.set(key, [post]);
  }
  const winners = [];
  const losers = [];
  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) => (isNewer(a, b) ? -1 : 1));
    const winner = ranked.find((p) => p.author !== null) ?? ranked[0];
    winners.push(winner);
    losers.push(...ranked.filter((p) => p !== winner));
  }
  return { winners, losers };
}
