/**
 * Header brand mark generator.
 *
 * Derives the circular MathNexa mark used in the site header from the SAME
 * owner-approved artwork the app icons come from
 * (`apps/platform-web/assets/brand/mathnexa-app-icon-source.jpg`), so the header,
 * the browser tab and the marketing banner all carry one identity and none of
 * them is a redraw.
 *
 * The full lock-up — bunny, inner wordmark and four sub-icons — is unreadable at
 * the 48 px the header renders it at, so the mark is the part that survives: the
 * bunny inside its own teal ring, both cropped straight out of the approved
 * image. The header supplies the "MathNexa" wordmark as live text, which stays
 * crisp at every size and every zoom level in a way a raster wordmark cannot.
 *
 * Emitted at 3x the display size so it is sharp on a high-density screen, and as
 * a static first-party PNG: no runtime image generation, no external host.
 *
 * Deterministic — running it twice produces identical bytes. Not part of the
 * build; run it by hand when the source artwork changes:
 *
 *   node scripts/generate-brand-mark.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SOURCE = join("apps", "platform-web", "assets", "brand", "mathnexa-app-icon-source.jpg");
const TARGET = join("apps", "platform-web", "public", "brand", "mathnexa-mark.png");

/** The header renders the mark at 3rem; 3x keeps it sharp on dense screens. */
const DISPLAY_PX = 48;
const SCALE = 3;

/** Teal sampled from the approved artwork's own ring. */
const RING = "#00C5CE";

/**
 * The bunny, framed inside the approved artwork: full ears, head and both paws,
 * stopping above the inner wordmark so no unreadable text is baked into the mark.
 */
const CROP = { left: 345, top: 70, width: 540, height: 540 };

const MASTER = 1024;
const RING_WIDTH = Math.round(MASTER * 0.055);
const INNER_RADIUS = MASTER / 2 - RING_WIDTH;

const circle = (radius, attrs) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}">` +
      `<circle cx="${MASTER / 2}" cy="${MASTER / 2}" r="${radius}" ${attrs}/></svg>`,
  );

const disc = circle(INNER_RADIUS, 'fill="#fff"');
const ring = circle(
  MASTER / 2 - RING_WIDTH / 2,
  `fill="none" stroke="${RING}" stroke-width="${RING_WIDTH}"`,
);

const art = await sharp(SOURCE)
  .extract(CROP)
  .resize(MASTER, MASTER, { kernel: "lanczos3" })
  .png()
  .toBuffer();

// Clip the bunny to the inner circle, lay it on a white disc, ring over the top.
const clipped = await sharp(art).composite([{ input: disc, blend: "dest-in" }]).png().toBuffer();
const onWhite = await sharp({
  create: { width: MASTER, height: MASTER, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
})
  .composite([{ input: disc }, { input: clipped }])
  .png()
  .toBuffer();

// Two passes on purpose: sharp orders `resize` before `composite` within one
// pipeline, so ringing and shrinking together would lay a full-size ring onto an
// already-shrunk canvas and fail.
const ringed = await sharp(onWhite).composite([{ input: ring }]).png().toBuffer();

const mark = await sharp(ringed)
  .resize(DISPLAY_PX * SCALE, DISPLAY_PX * SCALE, { kernel: "lanczos3" })
  .sharpen({ sigma: 0.6, m1: 0, m2: 2 })
  .png({ compressionLevel: 9, effort: 10 })
  .toBuffer();

writeFileSync(TARGET, mark);

console.log(
  `generate-brand-mark: wrote ${TARGET} — ${DISPLAY_PX * SCALE}x${DISPLAY_PX * SCALE} ` +
    `(${DISPLAY_PX} px at ${SCALE}x), ${readFileSync(TARGET).length} bytes, from ${SOURCE}`,
);
