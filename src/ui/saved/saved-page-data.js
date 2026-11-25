/**
 * In-memory pipeline of the Saved page: orphan folders, filter, sort, tag counts and paging.
 * Holds only the page counter; everything else is derived from the posts it is given.
 */

import { filterPosts } from '../../core/search.js';
import { sortPosts, tagCounts, adoptOrphans, visibleSlice } from '../../core/post-view.js';

export function createPageData() {
  let pages = 1;
  return {
    adopt: adoptOrphans,
    firstPage: () => (pages = 1),
    nextPage: () => (pages += 1),
    /**
     * @param {object[]} all every live post, orphans already adopted
     * @param {object} query `{text, folderId, tag}` as built by the filters
     * @param {string} order
     */
    derive(all, query, order) {
      const sorted = sortPosts(filterPosts(all, query), order);
      return { ...visibleSlice(sorted, pages), tags: tagCounts(all) };
    },
  };
}
