import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_AVATAR, ITEMS } from "@/public/internal-games/polygon-showdown/src/engine/catalog.js";
import { productView } from "@/public/internal-games/polygon-showdown/src/avatar/product.js";
import { PRODUCT_RENDER_SOURCE } from "@/public/internal-games/polygon-showdown/src/product-images.js";

const GAME = resolve(__dirname, "../../../public/internal-games/polygon-showdown");
const AVATAR = join(GAME, "src/avatar");
const PRODUCTS = join(GAME, "products");

// The same recipe as scripts/render-polygon-showdown-products.mjs.
function sourceHash(): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(ITEMS));
  hash.update(readFileSync(join(GAME, "src/engine/catalog.js"), "utf8").replace(/\r\n/g, "\n"));
  for (const name of readdirSync(AVATAR).filter((file) => file.endsWith(".js")).sort()) {
    hash.update(name);
    hash.update(readFileSync(join(AVATAR, name), "utf8").replace(/\r\n/g, "\n"));
  }
  return hash.digest("hex");
}

describe("shop product images", () => {
  it("come from the catalog and the renderer as they are now", () => {
    // Change an item or the avatar code and this fails until the images are re-rendered:
    //   node scripts/render-polygon-showdown-products.mjs
    expect(sourceHash()).toBe(PRODUCT_RENDER_SOURCE);
  });

  it("exist for every item, in both formats and both sizes", () => {
    expect(ITEMS).toHaveLength(153);
    for (const item of ITEMS) {
      for (const size of [200, 400]) {
        for (const format of ["webp", "avif"]) {
          const file = join(PRODUCTS, `${item.id}-${size}.${format}`);
          expect(existsSync(file), file).toBe(true);
          expect(statSync(file).size, file).toBeGreaterThan(400);
        }
      }
    }
  });

  it("stay light enough for a school connection", () => {
    let largest = 0;
    let total = 0;
    for (const item of ITEMS) {
      const size = statSync(join(PRODUCTS, `${item.id}-200.avif`)).size;
      largest = Math.max(largest, size);
      total += size;
    }
    expect(largest).toBeLessThan(16_000);
    expect(total / ITEMS.length).toBeLessThan(8_000);
  });

  it("are the only files in the folder", () => {
    const expected = new Set(ITEMS.flatMap((item) => [200, 400].flatMap((size) => ["webp", "avif"].map((format) => `${item.id}-${size}.${format}`))));
    expect(readdirSync(PRODUCTS).filter((file) => !expected.has(file))).toEqual([]);
  });

  it("show each item through its own catalog entry", () => {
    for (const item of ITEMS) {
      const view = productView(item);
      expect(view.avatar[item.slot], item.id).toBe(item.id);
      expect(view.show.length, item.id).toBeGreaterThan(0);
    }
  });

  it("show hair and skin as a new avatar has them, so Try On matches the card", () => {
    for (const item of ITEMS) {
      const view = productView(item);
      if (item.slot !== "hairColor") expect(view.avatar.hairColor, item.id).toBe(DEFAULT_AVATAR.hairColor);
      expect(view.avatar.skin, item.id).toBe(DEFAULT_AVATAR.skin);
    }
  });
});
