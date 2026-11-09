import { describe, expect, it } from "vitest";

import { ITEMS } from "@/public/internal-games/polygon-showdown/src/engine/catalog.js";
// @ts-expect-error A browser module, with no declarations.
import { frameFor } from "@/public/internal-games/polygon-showdown/src/avatar/frame.js";
// @ts-expect-error A browser module, with no declarations.
import { hatFit } from "@/public/internal-games/polygon-showdown/src/avatar/accessories.js";
// @ts-expect-error A browser module, with no declarations.
import { buildHair } from "@/public/internal-games/polygon-showdown/src/avatar/hair.js";
// @ts-expect-error A browser module, with no declarations.
import { buildShoes } from "@/public/internal-games/polygon-showdown/src/avatar/shoes.js";

type Attribute = { count: number; getX(index: number): number; getY(index: number): number; getZ(index: number): number };
type Part = { geometry: { getAttribute(name: string): Attribute; getIndex(): Attribute }; material: string; wornOnly?: boolean };

const materials = new Proxy({}, { get: (_target, key) => key });
const frame = frameFor("base-a");

/** The share of a part's faces that point away from the middle of the foot they belong to. */
function facingOut(part: Part): number {
  const positions = part.geometry.getAttribute("position");
  const index = part.geometry.getIndex();
  let outward = 0;
  let total = 0;
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const ax = positions.getX(a);
    const ay = positions.getY(a);
    const az = positions.getZ(a);
    const bx = positions.getX(b) - ax;
    const by = positions.getY(b) - ay;
    const bz = positions.getZ(b) - az;
    const cx = positions.getX(c) - ax;
    const cy = positions.getY(c) - ay;
    const cz = positions.getZ(c) - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    const mx = ax + (bx + cx) / 3;
    const my = ay + (by + cy) / 3;
    const mz = az + (bz + cz) / 3;
    const ankle = frame.legs[mx > 0 ? 1 : -1].point(1);
    if (nx * (mx - ankle.x) + ny * (my - 0.04) + nz * (mz - 0.08) > 0) outward += 1;
    total += 1;
  }
  return outward / total;
}

describe("a crown", () => {
  const SCALP_RING = 0.33;
  const ringHeight = (model: string, fit: unknown) => buildHair(model, fit, materials).info.ringTop(0.31);

  it("sits on the hair round buns instead of balancing on them", () => {
    expect(ringHeight("twinbuns", hatFit("crown"))).toBeLessThan(SCALP_RING);
    expect(ringHeight("bun", hatFit("crown"))).toBeLessThan(SCALP_RING);
  });

  it("changes nothing about the buns when no crown is worn", () => {
    expect(ringHeight("twinbuns", null)).toBeGreaterThan(0.5);
    expect(buildHair("twinbuns", null, materials).info.top).toBeGreaterThan(0.55);
    expect(buildHair("bun", null, materials).info.top).toBeGreaterThan(0.7);
  });
});

describe("shoes", () => {
  const shoes = ITEMS.filter((item) => item.slot === "shoes");

  it("are built outward, or the floor shows through the sole", () => {
    expect(shoes).toHaveLength(12);
    for (const item of shoes) {
      for (const covered of [false, true]) {
        const parts = buildShoes(item, frame, materials, "#BC8158", covered) as Part[];
        expect(facingOut(parts[0]), `${item.id} upper`).toBeGreaterThan(0.85);
        expect(facingOut(parts[1]), `${item.id} sole`).toBeGreaterThan(0.75);
      }
    }
  });

  it("show the wearer's foot only when worn", () => {
    for (const item of shoes) {
      const parts = buildShoes(item, frame, materials, "#BC8158", false) as Part[];
      const open = item.model === "flat" || item.model === "heel";
      expect(parts.some((part) => part.wornOnly), item.id).toBe(open);
    }
  });
});
