/**
 * Small inline SVG icons (24x24 viewBox, stroke based), built with DOM APIs only.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  // Original outline gear: 8 evenly spaced teeth (tip radius 9.5, root radius 7) and a centred circle (r 3).
  gear: 'M10.19 5.24L10.51 2.62L13.49 2.62L13.81 5.24A7 7 0 0 1 15.5 5.94L17.58 4.31L19.69 6.42L18.06 8.5A7 7 0 0 1 18.76 10.19L21.38 10.51L21.38 13.49L18.76 13.81A7 7 0 0 1 18.06 15.5L19.69 17.58L17.58 19.69L15.5 18.06A7 7 0 0 1 13.81 18.76L13.49 21.38L10.51 21.38L10.19 18.76A7 7 0 0 1 8.5 18.06L6.42 19.69L4.31 17.58L5.94 15.5A7 7 0 0 1 5.24 13.81L2.62 13.49L2.62 10.51L5.24 10.19A7 7 0 0 1 5.94 8.5L4.31 6.42L6.42 4.31L8.5 5.94A7 7 0 0 1 10.19 5.24ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
  pencil: 'M4 20l1-4L16.5 4.5a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8 19zM14 7l3 3',
  folder: 'M3.5 6.5h6l2 2h9v10h-17z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM20 20l-4.8-4.8',
};

/** Names of every icon (used by the dev preview page and the tests). */
export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

/**
 * @param {Document} doc
 * @param {keyof typeof PATHS} name
 * @param {{size?: number}} [opts]
 */
export function createIcon(doc, name, { size = 18 } = {}) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.appendChild(path);
  return svg;
}
