/**
 * Pure placement for the panel, in viewport coordinates (the panel host is position: fixed):
 * below the button when it fits, otherwise above; right-aligned unless that would run off the
 * left edge; always clamped inside the viewport with an 8 px margin.
 */
(function () {
  const ns = (globalThis.__xmark = globalThis.__xmark || {});
  const MARGIN = 8;
  const OFFSET = 4;
  const DEFAULT = Object.freeze({ placement: 'below', align: 'right', left: MARGIN, top: MARGIN });
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, size, room) => Math.max(MARGIN, Math.min(v, room - MARGIN - size));

  /**
   * @param {{buttonRect: {top: number, bottom: number, left?: number, right: number},
   *   panelSize: {width: number, height: number}, viewport: {width: number, height: number}}} input
   * @returns {{placement: 'below'|'above', align: 'right'|'left', left: number, top: number}}
   */
  ns.placePanel = function placePanel({ buttonRect, panelSize, viewport } = {}) {
    const ok =
      buttonRect &&
      panelSize &&
      viewport &&
      [buttonRect.top, buttonRect.bottom, buttonRect.right].every(num) &&
      [panelSize.width, panelSize.height, viewport.width, viewport.height].every(num);
    if (!ok) return { ...DEFAULT };
    const { width, height } = panelSize;
    const below = viewport.height - buttonRect.bottom - OFFSET - MARGIN;
    const above = buttonRect.top - OFFSET - MARGIN;
    let placement = 'below';
    if (below < height) placement = above >= height || above > below ? 'above' : 'below';
    const leftOverflow = Math.max(0, MARGIN - (buttonRect.right - width));
    const rightOverflow = num(buttonRect.left)
      ? Math.max(0, buttonRect.left + width - (viewport.width - MARGIN))
      : 0;
    // Prefer right alignment; left-align only when that overflows less.
    const align = leftOverflow > 0 && leftOverflow > rightOverflow ? 'left' : 'right';
    const rawLeft =
      align === 'left' && num(buttonRect.left) ? buttonRect.left : buttonRect.right - width;
    const rawTop =
      placement === 'below' ? buttonRect.bottom + OFFSET : buttonRect.top - OFFSET - height;
    return {
      placement,
      align,
      left: clamp(rawLeft, width, viewport.width),
      top: clamp(rawTop, height, viewport.height),
    };
  };

  /** False when the anchor is gone from view (zero-sized or entirely outside the viewport). */
  ns.anchorVisible = function anchorVisible(button) {
    if (typeof button?.getBoundingClientRect !== 'function') return true;
    const r = button.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const { innerWidth: w, innerHeight: h } = globalThis;
    return !(r.bottom <= 0 || r.right <= 0 || (num(h) && r.top >= h) || (num(w) && r.left >= w));
  };

  /** Measure the panel, place its fixed host and mirror the choice in data attributes. */
  ns.applyPlacement = function applyPlacement(panel, button, host) {
    if (typeof panel.getBoundingClientRect !== 'function') return;
    const p = panel.getBoundingClientRect();
    const out = ns.placePanel({
      buttonRect: button.getBoundingClientRect(),
      panelSize: { width: p.width, height: p.height },
      viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
    });
    host.style.setProperty('left', `${out.left}px`, 'important');
    host.style.setProperty('top', `${out.top}px`, 'important');
    panel.setAttribute('data-placement', out.placement);
    panel.setAttribute('data-align', out.align);
  };
})();
