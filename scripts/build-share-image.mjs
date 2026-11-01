// Builds the 1200x630 link-preview card for mathnexa.com:
//   apps/platform-web/public/media/social/mathnexa-share.png
// from the owner-approved app icon art (apps/platform-web/assets/brand/mathnexa-app-icon-source.jpg)
// and copy the homepage already shows. The art is cropped to the rabbit only, so the icon's
// older "MAP Prep" label never appears. Usage: node scripts/build-share-image.mjs
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import sharp from "sharp";

const SOURCE = resolve("apps/platform-web/assets/brand/mathnexa-app-icon-source.jpg");
const OUT = resolve("apps/platform-web/public/media/social/mathnexa-share.png");
const WIDTH = 1200;
const HEIGHT = 630;

const NAVY = "#0d3b57";
const TURQUOISE = "#20cfe3";
const PINK = "#ff4f9a";
const SUN = "#f5c542";
const MIST = "#c9dce5";
const FONT = "'Trebuchet MS', 'Segoe UI', Arial, sans-serif";

// The rabbit's head in the 1254 px icon, above the wordmark band, masked to a circle.
const CROP = { left: 397, top: 70, width: 460, height: 460 };
const PORTRAIT = 380;
const PORTRAIT_LEFT = 80;
const PORTRAIT_TOP = 125;

const circle = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

const portrait = await sharp(SOURCE)
  .extract(CROP)
  .resize(PORTRAIT, PORTRAIT)
  .composite([{ input: circle(PORTRAIT), blend: "dest-in" }])
  .png()
  .toBuffer();

const cx = PORTRAIT_LEFT + PORTRAIT / 2;
const cy = PORTRAIT_TOP + PORTRAIT / 2;
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${NAVY}"/>
  <circle cx="${cx}" cy="${cy}" r="${PORTRAIT / 2 + 9}" fill="#fff" stroke="${TURQUOISE}" stroke-width="12"/>
  <rect y="${HEIGHT - 18}" width="${WIDTH * 0.68}" height="18" fill="${TURQUOISE}"/>
  <rect x="${WIDTH * 0.68}" y="${HEIGHT - 18}" width="${WIDTH * 0.32}" height="18" fill="${PINK}"/>
</svg>`);

// Homepage headline (components/public/home/home-copy.ts) and the product names the navigation uses.
const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <g font-family="${FONT}">
    <text x="530" y="182" font-size="64" font-weight="800" fill="#fff">Math<tspan fill="${TURQUOISE}">Nexa</tspan></text>
    <g font-size="46" font-weight="700" fill="#fff">
      <text x="530" y="266">Online math prep that</text>
      <text x="530" y="322">shows the thinking,</text>
      <text x="530" y="378">not just the answer.</text>
    </g>
    <g font-size="24" font-weight="600" fill="${MIST}">
      <text x="530" y="448">Math games · Online Math Prep for Grades 3–8</text>
      <text x="530" y="482">Homework PDFs · Quiz PDFs</text>
    </g>
    <text x="530" y="552" font-size="28" font-weight="800" fill="${SUN}">mathnexa.com</text>
  </g>
</svg>`);

mkdirSync(dirname(OUT), { recursive: true });
await sharp(background)
  .composite([{ input: portrait, left: PORTRAIT_LEFT, top: PORTRAIT_TOP }, { input: text, left: 0, top: 0 }])
  .png({ compressionLevel: 9 })
  .toFile(OUT);
const meta = await sharp(OUT).metadata();
console.log(`${OUT}: ${meta.width}x${meta.height} ${meta.format}`);
