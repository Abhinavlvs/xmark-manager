/**
 * Frame shared by every options section: a heading (focusable so navigation can move focus
 * to it), an optional intro line and a body to fill.
 */

/**
 * @param {ReturnType<import('../../ui/dom.js').createDom>} dom
 * @param {{id: string, title: string, intro?: string}} opts
 */
export function createSection(dom, { id, title, intro }) {
  const heading = dom.el('h1', { text: title, attrs: { id: `heading-${id}`, tabindex: -1 } });
  const body = dom.el('div', { class: 'section-body' });
  const element = dom.el(
    'section',
    { class: 'section', attrs: { id: `section-${id}`, 'aria-labelledby': `heading-${id}` } },
    heading,
    intro ? dom.el('p', { class: 'muted section-intro', text: intro }) : null,
    body,
  );
  return { element, heading, body };
}

/** An inline error line that is announced when it is shown. */
export function createAlert(dom, className = '') {
  const node = dom.el('p', {
    class: `note-error ${className}`.trim(),
    attrs: { role: 'alert', hidden: true },
  });
  return {
    element: node,
    show(text) {
      node.textContent = text;
      node.hidden = false;
    },
    hide() {
      node.hidden = true;
    },
  };
}
