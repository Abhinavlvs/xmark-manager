/**
 * Tiny element builder. Text always goes through textContent, never innerHTML.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});

  /**
   * @param {Document} doc
   * @param {string} tag
   * @param {Record<string, string>} [attrs]
   * @param {string} [text]
   */
  ns.el = function el(doc, tag, attrs = {}, text) {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };

  ns.clear = function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  };
})();
