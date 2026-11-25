/**
 * The panel's own top-level host: appended to the document root (never inside X's article, so
 * X's stacking contexts, overflow clipping and sticky layers cannot hide it), position: fixed with
 * the maximal z-index, closed shadow root. At most one exists. Also the shared event guard for
 * our roots and the scroll/resize watcher used while the panel is open.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const PANEL_HOST_ATTR = 'data-xmark-panel-host';
  // Events that carry typed or pasted text (or trigger X shortcuts) stop at our root.
  const STOP = [
    'click',
    'keydown',
    'keyup',
    'keypress',
    'beforeinput',
    'input',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'paste',
    'copy',
    'cut',
  ];
  const HOST_STYLE = {
    position: 'fixed',
    left: '0px',
    top: '0px',
    'z-index': '2147483647',
    display: 'block',
    width: 'min(320px, calc(100vw - 16px))',
    margin: '0',
    padding: '0',
    border: '0',
    opacity: '1',
    transform: 'none',
    visibility: 'visible',
    'pointer-events': 'auto',
  };

  /** panel host -> closed shadow root (content-script world only). */
  const roots = new WeakMap();
  let live = null;

  /** Keep X's own click-through and keyboard shortcuts away from our UI. */
  function stopAtRoot(root, onEscape) {
    for (const type of STOP) {
      root.addEventListener(type, (event) => {
        // Escape inside our UI closes the panel here, before propagation is stopped.
        if (type === 'keydown' && event.key === 'Escape') onEscape?.();
        event.stopPropagation();
      });
    }
  }

  function remove() {
    live?.remove();
    live = null;
  }

  function create(doc, onEscape) {
    remove();
    const host = doc.createElement('div');
    host.setAttribute(PANEL_HOST_ATTR, '');
    for (const [name, value] of Object.entries(HOST_STYLE)) {
      host.style.setProperty(name, value, 'important');
    }
    const root = host.attachShadow({ mode: 'closed' });
    roots.set(host, root);
    root.appendChild(ns.el(doc, 'style', {}, ns.panelStyles));
    stopAtRoot(root, onEscape);
    doc.documentElement.appendChild(host);
    live = host;
    return { host, root };
  }

  /** Call `onChange` (frame-throttled) on scroll or resize until the returned stop() runs. */
  function watch(doc, onChange) {
    const win = doc.defaultView ?? globalThis;
    const scrollOpts = { capture: true, passive: true };
    const resizeOpts = { passive: true };
    let stopped = false;
    let queued = false;
    const run = () => {
      if (stopped || !queued) return;
      queued = false;
      onChange();
    };
    const request = () => {
      if (queued) return;
      queued = true;
      const raf = globalThis.requestAnimationFrame;
      // Timer fallback: frames do not fire in hidden tabs.
      if (typeof raf === 'function') {
        raf(run);
        setTimeout(run, 100);
      } else setTimeout(run, 16);
    };
    win.addEventListener('scroll', request, scrollOpts);
    win.addEventListener('resize', request, resizeOpts);
    return () => {
      stopped = true;
      win.removeEventListener('scroll', request, scrollOpts);
      win.removeEventListener('resize', request, resizeOpts);
    };
  }

  ns.stopAtRoot = stopAtRoot;
  ns.panelHost = {
    ATTR: PANEL_HOST_ATTR,
    create,
    remove,
    watch,
    rootFor: (h) => roots.get(h) ?? null,
  };
})();
