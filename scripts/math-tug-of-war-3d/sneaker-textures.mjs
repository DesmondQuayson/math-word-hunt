#!/usr/bin/env node
/**
 * Team sneaker textures for the Math Tug of War characters.
 *
 * The footwear mesh is the CC0 MakeHuman system asset `shoes05` (a laced
 * athletic sneaker). Its photographed texture carries a third party's
 * three-stripe side design and a small maker's mark on the sole; neither may
 * ship. This script builds two clean team textures on the same UV layout
 * from the texture's own luminance (so the laces, eyelets, stitching,
 * perforations and tread keep their relief):
 *
 *   - upper: white, with the stripes painted out and the maker's marks
 *     removed; heel counter and the tongue top in the team colour, a dark
 *     outline at the sole seam;
 *   - lining: dark charcoal mesh;
 *   - sole: a white midsole band over a charcoal outsole with the tread, team
 *     colour on the tread inserts.
 *
 *   node scripts/math-tug-of-war-3d/sneaker-textures.mjs --source <shoes05_diffuse.png> --out <dir>
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const source = resolve(option("--source", "shoes05_diffuse.png"));
const outDir = resolve(option("--out", "."));
mkdirSync(outDir, { recursive: true });

const TEAMS = {
  turquoise: { base: [0x12, 0xbc, 0xcf], dark: [0x0b, 0x7f, 0x8d] },
  pink: { base: [0xff, 0x4f, 0x9a], dark: [0xc2, 0x2e, 0x6e] }
};
const WHITE = [246, 246, 244];
const CHARCOAL = [44, 47, 53];
const LINING = [58, 61, 68];
const MIDSOLE = [236, 236, 232];

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const px = (x, y) => (y * width + x) * 4;
const lum = (x, y) => { const i = px(x, y); return (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Regions on the 1024 UV layout (scaled for other sizes).
const S = width / 1024;
const inSole = (x, y) => y < 275 * S && x > 255 * S;
const inUpper = (x, y) => y >= 470 * S;
const inLining = (x, y) => !inSole(x, y) && !inUpper(x, y);
// The third party's stripe panels, painted out (two bands either side of the lacing).
const inStripes = (x, y) => y > 530 * S && y < 760 * S && ((x > 190 * S && x < 400 * S) || (x > 610 * S && x < 830 * S));
// Heel counters (texture sides of the upper) and the tongue top take the team colour.
const inHeel = (x, y) => inUpper(x, y) && y < 700 * S && (x < 180 * S || x > 845 * S);
const inTongueTop = (x, y) => y > 500 * S && y < 560 * S && x > 440 * S && x < 585 * S;
const inSoleSeam = (x, y) => inUpper(x, y) && y > 905 * S;
const greenish = (x, y) => { const i = px(x, y); return data[i + 1] > data[i] * 1.25 && data[i + 1] > data[i + 2] * 1.25 && data[i + 1] > 70; };

// Smooth white reference for painting the stripes out: the local bright tone of the upper.

function build(team) {
  const colour = TEAMS[team];
  const out = Buffer.alloc(width * height * 3);
  const put = (x, y, [r, g, b], shade = 1) => { const o = (y * width + x) * 3; out[o] = clamp01(r * shade / 255) * 255; out[o + 1] = clamp01(g * shade / 255) * 255; out[o + 2] = clamp01(b * shade / 255) * 255; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const L = lum(x, y);
      if (inSole(x, y)) {
        // Tread relief from the luminance; a white midsole band along the island's upper edge.
        const relief = 0.75 + 0.5 * L;
        if (y < 70 * S) put(x, y, MIDSOLE, 0.9 + 0.1 * L);
        else if (greenish(x, y)) put(x, y, colour.base, 0.85 + 0.3 * L);
        else put(x, y, CHARCOAL, relief);
      } else if (inLining(x, y)) {
        put(x, y, LINING, 0.7 + 0.6 * L);
      } else if (inStripes(x, y) && L < 0.55) {
        // Paint the stripes out with the surrounding white.
        put(x, y, WHITE, 0.95 + 0.05 * L);
      } else if (greenish(x, y)) {
        put(x, y, inTongueTop(x, y) ? colour.base : WHITE, 0.95);
      } else if (inSoleSeam(x, y)) {
        put(x, y, mix(CHARCOAL, WHITE, clamp01((L - 0.25) / 0.5)), 0.95 + 0.1 * L);
      } else if (inHeel(x, y) || inTongueTop(x, y)) {
        // Team panel: the photo's shading kept, the colour deepened in the folds.
        put(x, y, mix(colour.dark, colour.base, clamp01((L - 0.2) / 0.6)), 0.85 + 0.35 * L);
      } else {
        // White upper: perforations and stitching stay as relief; the darkest trims turn charcoal.
        if (L < 0.22) put(x, y, CHARCOAL, 0.8 + 0.6 * L);
        else put(x, y, WHITE, 0.62 + 0.42 * L);
      }
    }
  }
  return sharp(out, { raw: { width, height, channels: 3 } }).webp({ quality: 84 }).toFile(join(outDir, `sneaker-${team}.webp`));
}
await build("turquoise");
await build("pink");
console.log(`sneaker textures written to ${outDir}`);
