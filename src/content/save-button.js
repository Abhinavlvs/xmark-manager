/**
 * The XM monogram pill button that sits in X's action bar, plus its saved-state tracking.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const LABEL = 'Save to xmark-manager';
  const SAVED_LABEL = 'Saved to xmark-manager';
  // The XM monogram. Duplicated from src/ui/logo-paths.js (classic scripts cannot import);
  // tests/content/logo-glyph.test.js keeps the two identical.
  const TRANSLATE = 'translate(2 0)';
  const POLYGONS = [
    '3.98,28 28.02,28 76.02,100 51.98,100',
    '51.98,28 76.02,28 28.02,100 3.98,100',
    '52,28 72,28 72,100 52,100',
    '52,28 74.24,28 86,44.65 97.76,28 120,28 120,31.17 86,79.33 52,31.17',
    '100,28 120,28 120,78 100,78',
    '100,80.5 120,80.5 120,100 110,90 100,100',
  ];
  // Cropped to the art (x 6..122, y 28..100) so the mark fills the button: 24 x 15 px.
  const MONOGRAM_VIEW_BOX = '4 26 122 76';
  ns.logoGlyph = Object.freeze({ TRANSLATE, POLYGONS, VIEW_BOX: MONOGRAM_VIEW_BOX });

  /** Hosts whose post was saved in this page session (forgotten on reload). */
  const savedHosts = new WeakMap();

  function svgNode(doc, name, attrs) {
    const node = doc.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  function glyph(doc) {
    const svg = svgNode(doc, 'svg', {
      viewBox: MONOGRAM_VIEW_BOX,
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'xm-mark',
    });
    const group = svgNode(doc, 'g', { transform: TRANSLATE, fill: 'currentColor' });
    for (const points of POLYGONS) group.appendChild(svgNode(doc, 'polygon', { points }));
    svg.appendChild(group);
    return svg;
  }

  /** Small check badge (10 px circle) at the bottom-right of the saved button. */
  function badge(doc) {
    const svg = svgNode(doc, 'svg', {
      viewBox: '0 0 10 10',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'xm-badge',
    });
    svg.appendChild(svgNode(doc, 'circle', { cx: '5', cy: '5', r: '5', fill: '#1d9bf0' }));
    svg.appendChild(
      svgNode(doc, 'path', {
        d: 'M2.7 5.2l1.6 1.6 3-3.2',
        fill: 'none',
        stroke: '#fff',
        'stroke-width': '1.4',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
    return svg;
  }

  function paint(button, saved) {
    ns.clear(button);
    button.appendChild(glyph(button.ownerDocument));
    if (saved) button.appendChild(badge(button.ownerDocument));
    button.setAttribute('data-saved', saved ? 'true' : 'false');
    const label = saved ? SAVED_LABEL : LABEL;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    if (saved) button.setAttribute('aria-pressed', 'true');
    else button.removeAttribute('aria-pressed');
  }

  /** @param {Document} doc @param {{host: Element}} opts */
  ns.createSaveButton = function createSaveButton(doc, { host }) {
    const button = ns.el(doc, 'button', {
      type: 'button',
      class: 'xm-btn',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    });
    paint(button, savedHosts.get(host) === true);
    return button;
  };

  ns.markSaved = function markSaved(host, button) {
    savedHosts.set(host, true);
    paint(button, true);
  };

  /** Plain check mark for the "Saved" line in the panel. */
  ns.createCheck = function createCheck(doc) {
    const svg = svgNode(doc, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.appendChild(
      svgNode(doc, 'path', {
        d: 'M5 12.5l4.5 4.5L19 7.5',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
    return svg;
  };
})();
