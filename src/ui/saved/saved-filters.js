/**
 * Search box, folder chips and tag filter for the Saved tab. Owns the query state.
 */

import { createIcon } from '../icons.js';
import { folderChips, countPosts } from './view-model.js';

const DEBOUNCE_MS = 200;

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{onChange: () => void, setTimer?: Function, clearTimer?: Function,
 *   variant?: 'popup'|'page'}} opts
 */
export function createSavedFilters(
  dom,
  { onChange, setTimer = setTimeout, clearTimer = clearTimeout, variant = 'popup' },
) {
  const query = { text: '', folderId: undefined, tag: undefined };
  let timer = null;

  /** Apply any typed-but-not-yet-debounced text right away. */
  function sync() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    query.text = search.value;
  }
  function change(mutate) {
    sync();
    mutate();
    onChange();
  }

  const search = dom.el('input', {
    class: 'input search',
    attrs: {
      type: 'search',
      placeholder: 'Search saved posts',
      'aria-label': 'Search saved posts',
    },
    on: {
      input: () => {
        if (timer !== null) clearTimer(timer);
        timer = setTimer(() => {
          timer = null;
          query.text = search.value;
          onChange();
        }, DEBOUNCE_MS);
      },
    },
  });
  const chipsNode = dom.el('div', {
    class: 'filter-chips',
    attrs: { role: 'group', 'aria-label': 'Filter by folder' },
    on: { scroll: updateFade },
  });
  const tagFilter = dom.el('div', { class: 'tag-filter', attrs: { hidden: true } });
  const searchWrap = dom.el(
    'div',
    { class: 'search-wrap' },
    createIcon(dom.doc, 'search', { size: 18 }),
    search,
  );
  // On the page the search box lives in the header row (moved there by the screen) and the
  // selected tag is shown by the tag cloud, so the popup's removable tag chip is not used.
  const element = dom.el(
    'div',
    { class: 'filters' },
    searchWrap,
    chipsNode,
    variant === 'page' ? null : tagFilter,
  );

  /** Show a right-edge fade while more chips are hidden off to the right. */
  function updateFade() {
    const more = chipsNode.scrollWidth - chipsNode.scrollLeft - chipsNode.clientWidth > 1;
    chipsNode.classList.toggle('fade-end', more);
  }

  function render({ folders, all, ready }) {
    dom.clear(chipsNode);
    const chips = ready ? folderChips(folders, countPosts(all)) : [];
    for (const chip of chips) {
      chipsNode.appendChild(
        dom.el(
          'button',
          {
            class: 'chip',
            attrs: { type: 'button', 'aria-pressed': String(chip.id === query.folderId) },
            on: { click: () => change(() => (query.folderId = chip.id)) },
          },
          chip.label,
          ' ',
          dom.el('span', { class: 'chip-count', text: String(chip.count) }),
        ),
      );
    }
    updateFade();
    dom.clear(tagFilter);
    tagFilter.hidden = !query.tag;
    if (query.tag) {
      tagFilter.append(
        dom.el(
          'span',
          { class: 'chip chip-tag' },
          `#${query.tag}`,
          dom.el(
            'button',
            {
              class: 'chip-remove',
              attrs: { type: 'button', 'aria-label': `Clear tag filter ${query.tag}` },
              on: { click: () => change(() => (query.tag = undefined)) },
            },
            createIcon(dom.doc, 'close', { size: 12 }),
          ),
        ),
      );
    }
  }

  const payload = () => {
    const p = {};
    if (query.text.trim()) p.text = query.text;
    if (query.folderId !== undefined) p.folderId = query.folderId;
    if (query.tag) p.tag = query.tag;
    return p;
  };

  return {
    element,
    searchWrap,
    render,
    payload,
    selectedTag: () => query.tag,
    isFiltered: () => Object.keys(payload()).length > 0,
    setTag: (tag) => change(() => (query.tag = tag)),
    /** Reset the query; the caller refreshes. */
    clear() {
      sync();
      query.text = '';
      query.folderId = undefined;
      query.tag = undefined;
      search.value = '';
    },
    setHidden: (hidden) => (element.hidden = hidden),
    focusSearch: () => search.focus(),
  };
}
