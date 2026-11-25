/**
 * Tiny DOM builder. Text always goes through text nodes / textContent, never HTML parsing.
 */

/**
 * @param {Document} doc
 */
export function createDom(doc) {
  /**
   * @param {string} tag
   * @param {{class?: string, text?: string, value?: string, attrs?: Record<string, unknown>,
   *   on?: Record<string, (e: Event) => void>, dataset?: Record<string, string>}} [props]
   * @param {...(Node|string|number|null|undefined|false)} children
   * @returns {HTMLElement}
   */
  function el(tag, props = {}, ...children) {
    const node = doc.createElement(tag);
    if (props.class) node.className = props.class;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.value !== undefined) node.value = props.value;
    for (const [name, value] of Object.entries(props.attrs ?? {})) {
      if (value === false || value === null || value === undefined) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
    for (const [name, value] of Object.entries(props.dataset ?? {})) node.dataset[name] = value;
    for (const [type, handler] of Object.entries(props.on ?? {}))
      node.addEventListener(type, handler);
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'object' ? child : doc.createTextNode(String(child)));
    }
    return node;
  }

  /** @param {Node} node */
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  return { doc, el, clear };
}
