/**
 * App-icon generator (browser tab + Apple touch icon).
 *
 * Single source of truth: `assets/brand/mathnexa-app-icon-source.jpg`, the
 * owner-approved MathNexa artwork. Nothing here redraws the mark — the only
 * geometric operation is a centring crop of the few blank pixels outside the
 * teal ring, so the disc sits square in the frame at every size.
 *
 * Written into apps/platform-web/app, NOT public/, so Next.js App Router metadata
 * file conventions own the <link rel="icon"> tags. That is what makes the URLs
 * base-path correct in every deployment (standalone at the origin root, GitHub
 * Pages under a project path, MathNexa integration at a configured subpath):
 * Next bases the emitted href, a hand-written `/favicon.ico` string would not.
 *
 *   src/app/favicon.ico     16 + 32 + 48 (multi-resolution, PNG-compressed)
 *   src/app/icon.png        192  — modern PNG tab icon, Android shortcut
 *   src/app/icon1.png       512  — high-resolution shortcut / desktop web app
 *   src/app/apple-icon.png  180  — iOS home screen, Safari
 *
 * Small-size legibility: at 16 and 32 CSS pixels a straight Lanczos reduction
 * of artwork this detailed turns to mush, so the small entries get an unsharp
 * mask and a slight saturation lift. That is a resampling correction, not a
 * redesign — geometry, proportions, orientation and hue are the artwork's.
 * The 512 master is a faithful reduction with no correction at all.
 *
 * The tab icons cut away the square's corners, which hold no artwork — only
 * the white ground the source JPEG was saved on — so the mark's own circular
 * badge is what a browser draws instead of a white tile on a dark tab strip.
 * The Apple icon is the exception and stays a full opaque square: iOS rounds
 * the corners itself and renders any transparency it is given against black.
 *
 * Deterministic — running it twice produces identical bytes. Not part of the
 * build; run it by hand when the source artwork changes:
 *
 *   node scripts/generate-app-icons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SOURCE = join("apps", "platform-web", "assets", "brand", "mathnexa-app-icon-source.jpg");
const APP_DIR = join("apps", "platform-web", "app");

/**
 * The blank frame outside the teal ring, measured on the source (1254 x 1254):
 * 9 px left, 12 px right, 5 px top, 3 px bottom. This is the largest square
 * centred on the disc, so the ring reaches every edge evenly and no part of the
 * mark is cropped.
 */
const CROP = { left: 2, top: 4, width: 1246, height: 1246 };

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** Sizes at or below this are corrected for legibility; larger ones are not. */
const SMALL_SIZE_CEILING = 48;

/**
 * A smooth-edged disc the size of the icon, used as an alpha mask. Applied
 * AFTER the reduction and the unsharp mask so the sharpening works on the
 * artwork alone; sharpening an already-masked image haloes its own edge.
 *
 * (Wording note: Tailwind's automatic source detection scans this directory and
 * mints a utility for any bare class name it finds in it, comments included.
 * The obvious adjective here is one of those, and using it added a dead rule to
 * the production stylesheet.)
 */
function discMask(size) {
  const radius = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${radius}" cy="${radius}" r="${radius}" fill="#fff"/></svg>`,
  );
}

/**
 * @param size    square edge in pixels
 * @param options `disc` cuts the square's corners away, leaving the mark's own
 *                circular badge. The corners hold no artwork — only the ground
 *                the JPEG was saved on — and a square white tile reads as a
 *                white box on a dark browser tab strip. `rgba` forces
 *                truecolour + alpha: Next.js decodes `app/favicon.ico` at build
 *                time to read its sizes and its ICO reader accepts only RGBA
 *                entries, failing the production build otherwise ("The PNG is
 *                not in RGBA format!"). Opaque outputs are palette-encoded
 *                instead — a third of the bytes, at a difference invisible
 *                below a 3x zoom.
 */
async function render(size, { rgba = false, disc = false } = {}) {
  let pipeline = sharp(SOURCE)
    .extract(CROP)
    .resize(size, size, { kernel: "lanczos3", fit: "fill" });

  if (size <= SMALL_SIZE_CEILING) {
    // Unsharp mask restores the ring, the rabbit's ears and the wordmark's
    // two-colour split, all of which a plain reduction smears into one grey.
    pipeline = pipeline.sharpen({ sigma: 1, m1: 0, m2: 3 }).modulate({ saturation: 1.15 });
  } else if (size <= 192) {
    pipeline = pipeline.sharpen({ sigma: 0.6, m1: 0, m2: 2 });
  }

  // The artwork's own ground is white. Flattening onto white rather than
  // leaving the ground transparent is what keeps the Apple icon safe: iOS
  // composites a transparent apple-touch icon against black.
  const flat = await pipeline.flatten({ background: WHITE }).png().toBuffer();

  if (!disc) {
    return rgba
      ? sharp(flat).ensureAlpha(1).png({ compressionLevel: 9, palette: false }).toBuffer()
      : sharp(flat).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  }

  const badge = sharp(flat)
    .ensureAlpha(1)
    .composite([{ input: discMask(size), blend: "dest-in" }]);

  return rgba
    ? badge.png({ compressionLevel: 9, palette: false }).toBuffer()
    : badge.png({ compressionLevel: 9, effort: 10 }).toBuffer();
}

/**
 * Minimal ICO container over PNG-compressed entries — the format every current
 * browser and Windows Vista and later read, at a fraction of the BMP size.
 * A 256-pixel entry would be encoded as 0; nothing here is that large.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach(({ size, png }, index) => {
    const at = index * 16;
    directory.writeUInt8(size, at + 0); // width
    directory.writeUInt8(size, at + 1); // height
    directory.writeUInt8(0, at + 2); // palette size (0 = truecolour)
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

const icoSizes = [16, 32, 48];
const icoEntries = [];
for (const size of icoSizes) {
  icoEntries.push({ size, png: await render(size, { rgba: true, disc: true }) });
}
writeFileSync(join(APP_DIR, "favicon.ico"), buildIco(icoEntries));

const pngTargets = [
  { file: "icon.png", size: 192, disc: true },
  { file: "icon1.png", size: 512, disc: true },
  // The Apple icon alone stays a full opaque square: iOS rounds the corners
  // itself and renders any transparency it is given against black.
  { file: "apple-icon.png", size: 180, disc: false },
];
for (const { file, size, disc } of pngTargets) {
  writeFileSync(join(APP_DIR, file), await render(size, { disc }));
}

const report = [
  `favicon.ico  ${icoSizes.join(" + ")}  ${readFileSync(join(APP_DIR, "favicon.ico")).length} bytes`,
  ...pngTargets.map(
    ({ file, size }) =>
      `${file.padEnd(13)}${String(size).padEnd(9)} ${readFileSync(join(APP_DIR, file)).length} bytes`,
  ),
];
console.log(`generate-app-icons: wrote from ${SOURCE}`);
for (const line of report) console.log(`  ${line}`);
