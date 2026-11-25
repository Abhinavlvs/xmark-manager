import { VIEW_BOX, TRANSLATE, POLYGONS } from './logo-paths.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(doc, name, attrs) {
  const node = doc.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Factory kept for API compatibility. Builds the SVG with DOM APIs only (never innerHTML).
 * No ids are needed any more, so builders share no state.
 */
export function createLogoFactory() {
  return function createLogo(doc, { size = 24, color = 'currentColor', title } = {}) {
    const svg = el(doc, 'svg', {
      width: size,
      height: size,
      viewBox: VIEW_BOX,
      focusable: 'false',
    });
    if (title) {
      svg.setAttribute('role', 'img');
      const titleEl = doc.createElementNS(SVG_NS, 'title');
      titleEl.textContent = title;
      svg.appendChild(titleEl);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    const g = el(doc, 'g', { transform: TRANSLATE, fill: color });
    for (const points of POLYGONS) g.appendChild(el(doc, 'polygon', { points }));
    svg.appendChild(g);
    return svg;
  };
}

export const createLogo = createLogoFactory();
