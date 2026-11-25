/**
 * Saved screen: search, filter by folder or tag, and manage saved posts. Shared by the popup
 * and the options Saved page. Data flow lives here; filter state, the page-only bar and list
 * rendering are in saved-filters / saved-bar / saved-list, the page pipeline in saved-page-data.
 *
 * `variant: 'popup'` asks the background to filter (small window, one screenful at a time).
 * `variant: 'page'` loads the whole library once and filters, sorts and pages it in memory.
 */

import { MSG } from '../../platform/messages.js';
import { describeError } from './view-model.js';
import { createSnackbar } from '../components/snackbar.js';
import { createSavedFilters } from './saved-filters.js';
import { createSavedList } from './saved-list.js';
import { createSavedBar } from './saved-bar.js';
import { createPageData } from './saved-page-data.js';

/**
 * @param {ReturnType<import('../dom.js').createDom>} dom
 * @param {{client: {request: Function}, now: () => Date, onOpenUrl: (url: string) => void,
 *   onGoSave?: () => void, setTimer?: Function, clearTimer?: Function, snackbarOptions?: object,
 *   variant?: 'popup'|'page', win?: object, isActive?: () => boolean,
 *   announce?: (text: string) => void}} opts
 */
export function createSavedScreen(
  dom,
  {
    client,
    now,
    onOpenUrl,
    onGoSave,
    setTimer,
    clearTimer,
    snackbarOptions,
    variant = 'popup',
    win,
    isActive = () => true,
    announce,
  },
) {
  const page = variant === 'page';
  let folders = [];
  let all = [];
  let posts = [];
  let view = 'loading'; // loading | ready | error
  let seq = 0;
  let allStale = true;
  const data = createPageData();

  const filters = createSavedFilters(dom, { onChange, setTimer, clearTimer, variant });
  const bar = page
    ? createSavedBar(dom, {
        onSort: () => onChange(),
        onTag: (tag) => filters.setTag(tag),
        onClear: () => clearFilters(),
      })
    : null;
  const notice = dom.el('div', { class: 'note-error', attrs: { role: 'alert', hidden: true } });
  const snackbar = createSnackbar(dom, snackbarOptions);
  const list = createSavedList(dom, {
    variant,
    now,
    onOpenUrl,
    onGoSave,
    onTag: (tag) => filters.setTag(tag),
    onDelete: (post) => remove(post),
    onPatch: async (id, patch) => {
      await client.request(MSG.UPDATE_POST, { id, patch });
      allStale = true;
    },
    onRefresh: () => refresh(),
    onCreateFolder: async (name) => {
      const folder = await client.request(MSG.CREATE_FOLDER, { name });
      folders = [...folders, folder];
      renderAll();
      return folder;
    },
    onRetry: () => refresh(),
    onClearFilters: () => clearFilters(),
  });
  const head = page
    ? dom.el('div', { class: 'saved-head' }, filters.searchWrap, bar.tools, bar.actions)
    : null;
  const element = dom.el(
    'div',
    { class: page ? 'screen saved-screen saved-page' : 'screen saved-screen' },
    head,
    filters.element,
    bar?.cloud,
    notice,
    dom.el('div', { class: 'snackbar-host' }, snackbar.element),
    list.element,
  );

  /** Filters or sort changed: the popup asks again, the page re-derives from memory. */
  function onChange() {
    if (!page) return refresh();
    data.firstPage();
    renderAll();
  }

  function clearFilters() {
    filters.clear();
    onChange();
  }

  function renderAll() {
    const filtered = filters.isFiltered();
    const emptyLibrary = view === 'ready' && !all.length && !filtered && (page || !folders.length);
    filters.setHidden(emptyLibrary);
    filters.render({ folders, all, ready: view === 'ready' });
    let more = null;
    if (page) {
      const d = data.derive(all, filters.payload(), bar.sort());
      posts = d.items;
      more = d.hasMore ? { shown: posts.length, total: d.total, onMore: () => showMore() } : null;
      bar.render({
        total: view === 'ready' ? d.total : null,
        tags: d.tags,
        selected: filters.selectedTag(),
        filtered,
      });
      head.hidden = emptyLibrary;
      if (emptyLibrary) bar.cloud.hidden = true;
    }
    list.render({ view, posts, folders, filtered, hasAny: all.length > 0, more });
  }

  function showMore() {
    const before = posts.length;
    data.nextPage();
    renderAll();
    list.focusCardAt(before);
    announce?.(`Showing ${posts.length} posts`);
  }

  async function remove(post) {
    const index = list.indexOf(post.id);
    try {
      await client.request(MSG.DELETE_POST, { id: post.id });
    } catch (err) {
      flash(err);
      return;
    }
    snackbar.show('Post deleted', { onAction: () => undo(post) });
    allStale = true;
    await refresh();
    if (!list.focusCardAt(index)) filters.focusSearch();
  }

  async function undo(post) {
    try {
      await client.request(MSG.SAVE_POST, {
        url: post.url,
        folderId: post.folder_id,
        tags: post.tags,
        notes: post.notes,
      });
    } catch (err) {
      flash(err);
      return;
    }
    allStale = true;
    await refresh();
  }

  function flash(err) {
    notice.textContent = describeError(err);
    notice.hidden = false;
  }

  /**
   * Latest request wins: `seq` drops responses that arrive after a newer request started.
   * A `quiet` refresh (window focus) keeps what is on screen if it fails.
   */
  async function refresh({ quiet = false } = {}) {
    const mine = (seq += 1);
    notice.hidden = true;
    try {
      const needAll = page || (allStale && filters.isFiltered());
      const [nextFolders, nextAll, nextPosts] = await Promise.all([
        client.request(MSG.LIST_FOLDERS),
        needAll ? client.request(MSG.LIST_POSTS, {}) : undefined,
        page ? undefined : client.request(MSG.LIST_POSTS, filters.payload()),
      ]);
      if (mine !== seq) return;
      folders = nextFolders;
      if (page) all = data.adopt(nextAll, nextFolders);
      else {
        posts = nextPosts;
        if (needAll) all = nextAll;
        else if (!filters.isFiltered()) all = nextPosts;
      }
      allStale = false;
      view = 'ready';
    } catch {
      if (mine !== seq || (quiet && view === 'ready')) return;
      view = 'error';
    }
    renderAll();
  }

  if (page && win?.document) {
    const wake = () => {
      if (win.document.visibilityState !== 'hidden' && view !== 'loading' && isActive()) {
        refresh({ quiet: true });
      }
    };
    win.addEventListener('focus', wake);
    win.document.addEventListener('visibilitychange', wake);
  }

  renderAll();
  return {
    element,
    ready: page ? Promise.resolve() : refresh(),
    refresh,
    focus: () => filters.focusSearch(),
  };
}
