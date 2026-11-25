/**
 * Adds one host element per post action bar. Never modifies X's own elements: it only appends
 * our host. Reads no post content: that happens later, on click. Silent when selectors fail.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const HOST_ATTR = 'data-xmark-host';
  /** host -> closed shadow root; page scripts cannot reach it (content-script world only). */
  const roots = new WeakMap();
  ns.injector = { rootFor: (host) => roots.get(host) ?? ns.panelHost.rootFor(host) };

  function mount(doc, article, bar) {
    const host = doc.createElement('div');
    host.setAttribute(HOST_ATTR, '');
    const root = host.attachShadow({ mode: 'closed' });
    roots.set(host, root);
    root.appendChild(ns.el(doc, 'style', {}, ns.styles));
    const button = ns.createSaveButton(doc, { host });
    root.appendChild(button);
    ns.stopAtRoot(root, () => ns.panel.closeCurrent({ focus: true }));
    button.addEventListener('click', (event) => {
      // Page scripts can dispatch synthetic clicks; only real user input may read or save.
      if (!event.isTrusted) return;
      ns.panel.toggle({ doc, host, root, button, article });
    });
    bar.appendChild(host);
  }

  function inject(doc, article) {
    if (article.querySelector(`[${HOST_ATTR}]`)) return;
    const bar = ns.selectors.findActionBar(article);
    if (!bar) return;
    try {
      mount(doc, article, bar);
    } catch {
      // Selectors or the page changed under us: do nothing, silently.
    }
  }

  function collect(node, into) {
    if (!node || node.nodeType !== 1 || node.hasAttribute?.(HOST_ATTR)) return;
    const { article } = ns.selectors;
    if (node.matches?.(article)) into.add(node);
    for (const found of node.querySelectorAll?.(article) ?? []) into.add(found);
    const parent = node.closest?.(article);
    if (parent) into.add(parent);
  }

  /** Mutations caused only by appending our own host (or happening inside it) need no work. */
  function isOurs(record) {
    if (record.target?.closest?.(`[${HOST_ATTR}]`)) return true;
    const added = Array.from(record.addedNodes);
    return (
      added.length > 0 &&
      record.removedNodes.length === 0 &&
      added.every((n) => n.hasAttribute?.(HOST_ATTR))
    );
  }

  let observer = null;

  /**
   * @param {{schedule?: (fn: () => void) => void, Observer?: typeof MutationObserver, doc?: Document}} [opts]
   */
  ns.start = function start({ schedule, Observer, doc } = {}) {
    if (observer) return;
    const document_ = doc ?? globalThis.document;
    const run = schedule ?? ((fn) => globalThis.requestAnimationFrame(fn));
    const Obs = Observer ?? globalThis.MutationObserver;
    const pending = new Set();
    let queued = false;

    const flush = () => {
      queued = false;
      const batch = Array.from(pending);
      pending.clear();
      for (const article of batch) if (article.isConnected !== false) inject(document_, article);
      ns.panel.closeIfDetached();
    };
    const enqueue = () => {
      if (queued) return;
      queued = true;
      run(flush);
    };

    observer = new Obs((records) => {
      for (const record of records) {
        if (isOurs(record)) continue;
        const owner = record.target?.closest?.(ns.selectors.article);
        if (owner) pending.add(owner);
        for (const node of record.addedNodes) collect(node, pending);
      }
      enqueue();
    });
    observer.observe(document_.body, { childList: true, subtree: true });
    collect(document_.body, pending);
    enqueue();
  };

  ns.stop = function stop() {
    observer?.disconnect();
    observer = null;
    ns.panel?.closeCurrent();
  };
})();
