import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

/**
 * MathNexa browser-tab and Apple app icons.
 *
 * mathnexa.com previously declared only `app/icon.svg`, and `/favicon.ico`
 * returned 404. Google Search does not treat an SVG-only favicon as eligible,
 * which is why the result carried a generic globe. These are the contracts that
 * fix must keep:
 *
 *   - the four raster files exist where the App Router convention looks;
 *   - the .ico is multi-resolution (16 + 32 + 48) rather than one size the
 *     browser rescales, and each entry's image matches its declared size;
 *   - the .ico entries are RGBA, because Next decodes app/favicon.ico at build
 *     time and its reader rejects anything else;
 *   - the tab icons keep the transparency outside the mark's disc, while the
 *     Apple icon stays opaque — iOS composites alpha against black;
 *   - Googlebot is not blocked from the home page or from any icon URL;
 *   - the icons are the SAME approved artwork ShowMe Math ships, so the two
 *     hostnames share one brand identity.
 *
 * Everything is read from bytes with no image library, so the test states what a
 * browser or crawler would actually parse.
 */

const APP_DIR = join(process.cwd(), "app");
const SOURCE_ARTWORK = join(process.cwd(), "assets", "brand", "mathnexa-app-icon-source.jpg");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG colour types that carry an alpha channel (greyscale+alpha, RGBA). */
const ALPHA_COLOUR_TYPES = new Set([4, 6]);

/** The multi-resolution entries inside favicon.ico, smallest first. */
const ICO_ENTRY_SIZES = [16, 32, 48];

function readPngHeader(bytes: Buffer) {
  expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes.readUInt8(25)
  };
}

function readAppFile(name: string): Buffer {
  const path = join(APP_DIR, name);
  expect(existsSync(path), `${name} is missing from app/`).toBe(true);
  return readFileSync(path);
}

function carriesTransparency(bytes: Buffer): boolean {
  // A palette PNG records transparency in a tRNS chunk rather than in the
  // colour type, so the colour type alone would not answer this.
  return (
    ALPHA_COLOUR_TYPES.has(readPngHeader(bytes).colourType) ||
    bytes.includes(Buffer.from("tRNS", "ascii"))
  );
}

describe("MathNexa app icons", () => {
  it("keeps the owner-approved source artwork the icons are generated from", () => {
    expect(existsSync(SOURCE_ARTWORK)).toBe(true);
  });

  it("no longer ships the superseded SVG-only icon", () => {
    // The SVG was a different mark AND was not enough for Google Search. Leaving
    // it in place would also give the app two competing icon declarations.
    expect(existsSync(join(APP_DIR, "icon.svg"))).toBe(false);
  });

  it("ships a multi-resolution favicon.ico covering 16, 32 and 48", () => {
    const ico = readAppFile("favicon.ico");

    expect(ico.readUInt16LE(0), "ICONDIR reserved field").toBe(0);
    expect(ico.readUInt16LE(2), "ICONDIR type (1 = icon)").toBe(1);

    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];

    for (let index = 0; index < count; index += 1) {
      const at = 6 + index * 16;
      // A stored 0 means 256 in the ICO directory; nothing here is that large.
      const width = ico.readUInt8(at) || 256;
      const height = ico.readUInt8(at + 1) || 256;
      const length = ico.readUInt32LE(at + 8);
      const offset = ico.readUInt32LE(at + 12);

      expect(width, "ICO entries must be square").toBe(height);
      expect(offset + length, `entry ${index} runs past the end of the file`).toBeLessThanOrEqual(
        ico.length
      );

      const header = readPngHeader(ico.subarray(offset, offset + length));
      expect(header.width, `entry ${index} declared ${width}`).toBe(width);
      expect(header.height, `entry ${index} declared ${height}`).toBe(height);
      expect(header.colourType, `entry ${index} must be RGBA for the build`).toBe(6);

      sizes.push(width);
    }

    expect(sizes).toEqual(ICO_ENTRY_SIZES);
  });

  it.each([
    { file: "icon.png", size: 192 },
    { file: "icon1.png", size: 512 },
    { file: "apple-icon.png", size: 180 }
  ])("ships $file at $size x $size", ({ file, size }) => {
    const header = readPngHeader(readAppFile(file));
    expect(header.width).toBe(size);
    expect(header.height).toBe(size);
  });

  it.each(["icon.png", "icon1.png"])(
    "cuts the square corners off %s so a dark tab strip gets a badge, not a white tile",
    (file) => {
      expect(carriesTransparency(readAppFile(file))).toBe(true);
    }
  );

  it("keeps the Apple touch icon opaque so iOS cannot render it on black", () => {
    expect(carriesTransparency(readAppFile("apple-icon.png"))).toBe(false);
  });

  it("offers Google Search a square raster favicon of at least 48 pixels", () => {
    // Google's favicon guidance wants a square icon and a raster it can use.
    // The .ico carries 48, and the PNG icons carry 192 and 512.
    const largest = Math.max(...ICO_ENTRY_SIZES);
    expect(largest).toBeGreaterThanOrEqual(48);
    for (const file of ["icon.png", "icon1.png", "apple-icon.png"]) {
      const header = readPngHeader(readAppFile(file));
      expect(header.width, `${file} must be square`).toBe(header.height);
    }
  });

  it.each([
    { file: "favicon.ico", maxKb: 16 },
    { file: "icon.png", maxKb: 48 },
    { file: "icon1.png", maxKb: 160 },
    { file: "apple-icon.png", maxKb: 48 }
  ])("keeps $file under $maxKb KB", ({ file, maxKb }) => {
    expect(readAppFile(file).length / 1024).toBeLessThan(maxKb);
  });
});

describe("icon crawlability", () => {
  const iconPaths = ["/favicon.ico", "/icon.png", "/icon1.png", "/apple-icon.png"];

  it("leaves the home page and every icon URL crawlable in platform production", () => {
    const previous = { ...process.env };
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    try {
      const rules = robots().rules;
      const rule = Array.isArray(rules) ? rules[0] : rules;
      const disallow = rule?.disallow;
      const blocked = typeof disallow === "string" ? [disallow] : (disallow ?? []);

      expect(rule?.allow).toBe("/");
      for (const path of iconPaths) {
        for (const prefix of blocked) {
          // robots.txt matching is a path prefix, so an icon is only blocked if
          // it actually starts with a disallowed prefix.
          expect(path.startsWith(prefix), `${path} is blocked by "${prefix}"`).toBe(false);
        }
      }
    } finally {
      process.env = previous;
    }
  });
});
