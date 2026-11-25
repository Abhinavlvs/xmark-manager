// Original XM monogram: six filled polygons in one colour on a 128x128 canvas.
// Single source of truth for src/ui/logo.js. The icon SVGs (src/icons/*.svg and
// assets/branding/*.svg) repeat it by necessity; tests/branding.test.js keeps them identical.
export const VIEW_BOX = '0 0 128 128';
export const SIZE = 128;
// Centres the art horizontally. The art spans y 28..100.
export const TRANSLATE = 'translate(2 0)';
export const POLYGONS = [
  // X diagonals
  '3.98,28 28.02,28 76.02,100 51.98,100',
  '51.98,28 76.02,28 28.02,100 3.98,100',
  // M left leg
  '52,28 72,28 72,100 52,100',
  // M V-shape (both diagonals merged)
  '52,28 74.24,28 86,44.65 97.76,28 120,28 120,31.17 86,79.33 52,31.17',
  // M right leg, upper part
  '100,28 120,28 120,78 100,78',
  // M right leg, bookmark piece (hairline gap above, V notch below)
  '100,80.5 120,80.5 120,100 110,90 100,100',
];
