/**
 * Page-only controls of the Saved screen: result count (a polite live region), sort select,
 * the most used tags as filter chips, and "Clear filters".
 */

const SORTS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['author', 'Author A to Z'],
];
const TOP_TAGS = 10;

/**
 * @param {ReturnType<import('../dom.js').createDom>} dom
 * @param {{onSort: () => void, onTag: (tag: string|undefined) => void, onClear: () => void}} deps
 */
export function createSavedBar(dom, { onSort, onTag, onClear }) {
  let expanded = false;
  let last = { tags: [], selected: undefined, filtered: false };

  const count = dom.el('p', {
    class: 'muted saved-count',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  const sort = dom.el(
    'select',
    {
      class: 'select saved-sort',
      attrs: { 'aria-label': 'Sort posts' },
      on: { change: () => onSort() },
    },
    ...SORTS.map(([value, label]) => dom.el('option', { text: label, attrs: { value } })),
  );
  const cloud = dom.el('div', {
    class: 'tag-cloud',
    attrs: { role: 'group', 'aria-label': 'Filter by tag' },
  });
  const actions = dom.el('div', { class: 'bar-actions' });
  const tools = dom.el('div', { class: 'saved-tools' }, count, sort);

  function chip({ tag, count: n }, selected) {
    return dom.el(
      'button',
      {
        class: 'chip',
        attrs: { type: 'button', 'aria-pressed': String(selected === tag) },
        on: { click: () => onTag(selected === tag ? undefined : tag) },
      },
      `#${tag}`,
      ' ',
      dom.el('span', { class: 'chip-count', text: String(n) }),
    );
  }

  function render(state) {
    last = state;
    const { tags, selected, filtered, total } = state;
    // Nothing is shown while loading, so "0 posts" never flashes before the library arrives.
    count.textContent = total === null ? '' : `${total} ${total === 1 ? 'post' : 'posts'}`;
    dom.clear(cloud);
    cloud.appendChild(dom.el('span', { class: 'muted tag-label', text: 'Tags:' }));
    const shown = expanded ? tags : tags.slice(0, TOP_TAGS);
    const extra = tags.find((t) => t.tag === selected);
    if (extra && !shown.includes(extra)) shown.push(extra);
    for (const t of shown) cloud.appendChild(chip(t, selected));
    if (tags.length > TOP_TAGS) {
      cloud.appendChild(
        dom.el('button', {
          class: 'btn btn-ghost btn-sm tag-more',
          text: expanded ? 'Show fewer tags' : 'Show all tags',
          attrs: { type: 'button', 'aria-expanded': String(expanded) },
          on: {
            click: () => {
              expanded = !expanded;
              render(last);
            },
          },
        }),
      );
    }
    cloud.hidden = tags.length === 0;
    dom.clear(actions);
    if (filtered) {
      actions.appendChild(
        dom.el('button', {
          class: 'btn btn-secondary btn-sm clear-filters',
          text: 'Clear filters',
          attrs: { type: 'button' },
          on: { click: onClear },
        }),
      );
    }
  }

  return {
    tools,
    cloud,
    actions,
    render,
    sort: () => sort.value || 'newest',
  };
}
