# XM monogram exports (review set)

- `xmark-{white|black}-{16,32,48,64,96,128,256,512}.svg`: source of truth. Same six polygons as `src/ui/logo-paths.js` (128x128 viewBox, `translate(2 0)`), only `width`/`height` set.
- `xmark-{white|black}-{...}.png`: same sizes, RGBA, **transparent background**, anti-aliased (16x16 supersampling, union coverage).
- `xmark-appicon-{48,96,128,256,512}.png`: white monogram (about 70% of the square, centred) on pure #000000 rounded square, corner radius 22%, transparent corners.
- `xmark-contact-sheet.png`: 1200x700; white variants on black, black variants on white, at 16/32/48/64/128/256 px drawn 1x, plus the 16 px icon enlarged 8x (nearest neighbour) at the right.

Regenerate: a zero-dependency Node 20 script (`export.mjs`) produced these; it lives in the session scratchpad and is not committed. It can be added as `scripts/` later on request.
