/**
 * Regenerates assets/branding/export/ (SVG + PNG monogram exports, app icons, contact sheet).
 *   node scripts/export-icons.mjs
 * Zero dependencies. The polygons are read from src/ui/logo-paths.js, the single source of truth.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = ROOT + 'assets/branding/export/';
const src = fs.readFileSync(ROOT + 'src/ui/logo-paths.js', 'utf8');
const POLYS = [...src.matchAll(/'([\d.,\s-]+)'/g)]
  .map((m) => m[1])
  .filter((s) => s.includes(',') && !s.startsWith('0 0'))
  .map((s) =>
    s
      .trim()
      .split(/\s+/)
      .map((p) => p.split(',').map(Number)),
  );
if (POLYS.length !== 6) throw new Error('polys ' + POLYS.length);
const SIZES = [16, 32, 48, 64, 96, 128, 256, 512];
const N = 16;
// coverage of union of polys (translate(2,0)), mapped by x'=x*k+tx, y'=y*k+ty
function polyCoverage(W, H, k, tx, ty) {
  const cov = new Float32Array(W * H);
  const polys = POLYS.map((p) => p.map(([x, y]) => [(x + 2) * k + tx, y * k + ty]));
  const mask = new Uint8Array(W * N);
  for (let py = 0; py < H; py++) {
    for (let sy = 0; sy < N; sy++) {
      const y = py + (sy + 0.5) / N;
      mask.fill(0);
      for (const p of polys) {
        const xs = [];
        for (let i = 0; i < p.length; i++) {
          const a = p[i],
            b = p[(i + 1) % p.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
            xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((u, v) => u - v);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          let s = Math.ceil(xs[i] * N - 0.5),
            e = Math.ceil(xs[i + 1] * N - 0.5); // sample centers (s+.5)/N in [x0,x1)
          s = Math.max(s, 0);
          e = Math.min(e, W * N);
          for (let c = s; c < e; c++) mask[c] = 1;
        }
      }
      for (let c = 0; c < W * N; c++) if (mask[c]) cov[py * W + (c >> 4)] += 1;
    }
  }
  for (let i = 0; i < cov.length; i++) cov[i] /= N * N;
  return cov;
}
const crcT = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = ~0;
  for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};
function chunk(t, d) {
  const l = Buffer.alloc(4);
  l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
}
function png(W, H, rgba) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(W, 0);
  ih.writeUInt32BE(H, 4);
  ih[8] = 8;
  ih[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function mono(size, v) {
  const cov = polyCoverage(size, size, size / 128, 0, 0);
  const b = Buffer.alloc(size * size * 4);
  for (let i = 0; i < cov.length; i++) {
    b[i * 4] = b[i * 4 + 1] = b[i * 4 + 2] = v;
    b[i * 4 + 3] = Math.round(cov[i] * 255);
  }
  return b;
}
function appicon(size) {
  const art = polyCoverage(
    size,
    size,
    (0.7 * size) / 116.02,
    size / 2 - ((0.7 * size) / 116.02) * 63.99 + 0,
    size / 2 - ((0.7 * size) / 116.02) * 64 + 0,
  );
  // note: translate(2) is included inside polyCoverage; bbox centre x in source coords = 63.99 (includes +2 shift)
  const r = 0.22 * size,
    b = Buffer.alloc(size * size * 4),
    M = 8;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (let j = 0; j < M; j++)
        for (let i = 0; i < M; i++) {
          const px = x + (i + 0.5) / M,
            py = y + (j + 0.5) / M;
          const dx = Math.max(r - px, 0, px - (size - r)),
            dy = Math.max(r - py, 0, py - (size - r));
          if (dx * dx + dy * dy <= r * r) n++;
        }
      const o = (y * size + x) * 4,
        a = art[y * size + x],
        v = Math.round(255 * a);
      b[o] = b[o + 1] = b[o + 2] = v;
      b[o + 3] = Math.round((255 * n) / (M * M));
    }
  return b;
}
const svg = (c, s) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">\n<g transform="translate(2 0)" fill="${c}">\n${POLYS.map((p) => `<polygon points="${p.map((q) => q.join(',')).join(' ')}"/>`).join('\n')}\n</g>\n</svg>\n`;
fs.mkdirSync(OUT, { recursive: true });
const imgs = {};
for (const [name, v] of [
  ['white', 255],
  ['black', 0],
])
  for (const s of SIZES) {
    fs.writeFileSync(`${OUT}xmark-${name}-${s}.svg`, svg(name, s));
    const b = mono(s, v);
    imgs[name + s] = b;
    fs.writeFileSync(`${OUT}xmark-${name}-${s}.png`, png(s, s, b));
  }
for (const s of [16, 32, 48, 96, 128, 256, 512])
  fs.writeFileSync(`${OUT}xmark-appicon-${s}.png`, png(s, s, appicon(s)));
// contact sheet
const W = 1200,
  H = 700,
  sheet = Buffer.alloc(W * H * 4);
function fillRect(x0, y0, w, h, v) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * W + x) * 4;
      sheet[o] = sheet[o + 1] = sheet[o + 2] = v;
      sheet[o + 3] = 255;
    }
}
function blit(img, s, x0, y0, z, bg) {
  for (let y = 0; y < s * z; y++)
    for (let x = 0; x < s * z; x++) {
      const i = (Math.floor(y / z) * s + Math.floor(x / z)) * 4,
        a = img[i + 3] / 255,
        o = ((y0 + y) * W + x0 + x) * 4;
      for (let c = 0; c < 3; c++) sheet[o + c] = Math.round(img[i + c] * a + bg * (1 - a));
      sheet[o + 3] = 255;
    }
}
const row = [16, 32, 48, 64, 128, 256];
[
  ['white', 0, 0],
  ['black', 255, 350],
].forEach(([n, bg, y0]) => {
  fillRect(0, y0, W, 350, bg);
  const total = row.reduce((a, b) => a + b, 0) + 128,
    gap = Math.floor((W - total) / (row.length + 2));
  let x = gap;
  for (const s of row) {
    blit(imgs[n + s], s, x, y0 + Math.floor((350 - s) / 2), 1, bg);
    x += s + gap;
  }
  blit(imgs[n + 16], 16, x, y0 + Math.floor((350 - 128) / 2), 8, bg); // 16px at 8x nearest
});
fs.writeFileSync(OUT + 'xmark-contact-sheet.png', png(W, H, sheet));
