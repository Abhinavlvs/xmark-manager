/**
 * Pure view-model helpers for the popup. No DOM, no browser APIs.
 * The pieces shared with the options Saved page live in `ui/saved/view-model.js`.
 */

import { parsePostUrl } from '../core/url.js';

export {
  parseTagInput,
  folderChips,
  describePost,
  emptyStateFor,
  safeOpenTarget,
  describeError,
  countPosts,
  relativeTime,
} from '../ui/saved/view-model.js';

export const NON_POST_HINT = 'Open a post on X to save it';

/**
 * @param {string|undefined} tabUrl
 */
export function buildSaveForm(tabUrl) {
  const parsed = parsePostUrl(tabUrl);
  if (!parsed) return { canSave: false, hint: NON_POST_HINT, author: null, canonicalUrl: null };
  return {
    canSave: true,
    hint: parsed.author ? `Post by @${parsed.author}` : 'Post on X',
    author: parsed.author,
    canonicalUrl: parsed.url,
  };
}
