/**
 * Centered empty/error/info block with an optional action.
 */

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{title: string, body: string, role?: string, action?: {label: string, onClick: () => void}}} opts
 */
export function createEmptyState(dom, { title, body, role, action }) {
  return dom.el(
    'div',
    { class: 'empty-state', attrs: { role } },
    dom.el('h3', { text: title }),
    dom.el('p', { class: 'muted', text: body }),
    action
      ? dom.el('button', {
          class: 'btn btn-secondary',
          text: action.label,
          attrs: { type: 'button' },
          on: { click: action.onClick },
        })
      : null,
  );
}
