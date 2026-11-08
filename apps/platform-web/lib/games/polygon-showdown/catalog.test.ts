import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BASES, catalogSummary, DEFAULT_AVATAR, equipItem, getItem, ITEMS, itemsForSlot, itemsForTab, normalizeAvatar, SHOP_TABS, SKIN_TONES, SLOTS, STARTER_ITEM_IDS } from "@/public/internal-games/polygon-showdown/src/engine/catalog.js";
import { ACHIEVEMENTS, DAILY_EARN_CAP, SHOWDOWN_REWARD_PER_MINUTE, SHOWDOWN_REWARD_RATE } from "@/public/internal-games/polygon-showdown/src/engine/economy.js";

const MIGRATION = readFileSync(resolve(__dirname, "../../../../../supabase/migrations/20261109100000_polygon_showdown.sql"), "utf8").replace(/\r\n/g, "\n");

describe("the database and the browser agree on every item", () => {
  const seed = MIGRATION.slice(MIGRATION.indexOf("insert into public.polygon_shop_items(item_key,slot,name,price,tier) values\n"));
  const rows = [...seed.slice(0, seed.indexOf("\n;\n")).matchAll(/^\('([^']+)','([^']+)','((?:[^']|'')+)',(\d+),'([^']+)'\)/gm)];

  it("has the same items at the same prices", () => {
    expect(rows).toHaveLength(ITEMS.length);
    for (const row of rows) {
      const item = getItem(row[1]);
      expect(item, row[1]).not.toBeNull();
      expect(item!.slot).toBe(row[2]);
      expect(item!.name).toBe(row[3].replace(/''/g, "'"));
      expect(item!.price).toBe(Number(row[4]));
      expect(item!.tier).toBe(row[5]);
    }
  });

  it("has the same daily limit and reward rule", () => {
    expect(MIGRATION).toContain(`greatest(0, ${DAILY_EARN_CAP}-so_far)`);
    expect(MIGRATION).toContain(`*${SHOWDOWN_REWARD_PER_MINUTE})::integer`);
    expect(MIGRATION).toContain(`p.coins*${SHOWDOWN_REWARD_RATE})`);
  });
});

describe("the shop", () => {
  it("every department has something for sale", () => {
    for (const tab of SHOP_TABS) expect(itemsForTab(tab.key).filter((item) => !item.starter).length, tab.key).toBeGreaterThan(0);
  });

  it("covers everything the owner listed", () => {
    expect(SHOP_TABS.map((tab) => tab.key)).toEqual(["tops", "bottoms", "dresses", "jackets", "shoes", "hats", "glasses", "jewelry", "hair", "facial-hair", "makeup"]);
    for (const model of ["short", "long", "curly", "straight", "braids", "locs", "afro", "fade", "bun", "ponytail"]) {
      expect(itemsForSlot("hair").some((item) => item.model === model), model).toBe(true);
    }
    for (const model of ["none", "mustache", "goatee", "shortbeard", "fullbeard"]) {
      expect(itemsForSlot("facialHair").some((item) => item.model === model), model).toBe(true);
    }
    for (const slot of ["lipstick", "eyeShadow", "blush", "eyeliner"]) expect(itemsForSlot(slot).length, slot).toBeGreaterThan(1);
    expect(itemsForSlot("outfit").some((item) => item.model === "suit")).toBe(true);
    expect(itemsForSlot("outfit").some((item) => item.model === "dress")).toBe(true);
    expect(itemsForSlot("bottom").some((item) => item.model === "skirt")).toBe(true);
    expect(itemsForSlot("bottom").some((item) => item.model === "pants")).toBe(true);
  });

  it("ids are unique, prices match their tiers", () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    const ranges: Record<string, [number, number]> = { starter: [0, 0], basic: [25, 80], mid: [120, 380], premium: [500, 750], rare: [1000, 3000], luxury: [2500, 8000], legendary: [6000, 25000] };
    for (const item of ITEMS) {
      const [min, max] = ranges[item.tier];
      expect(item.price, item.id).toBeGreaterThanOrEqual(min);
      expect(item.price, item.id).toBeLessThanOrEqual(max);
    }
  });

  it("offers affordable, mid-term and aspirational goals", () => {
    const summary = catalogSummary();
    expect(summary.tiers.map((tier) => tier.tier)).toEqual(["basic", "mid", "premium", "rare", "luxury", "legendary"]);
    for (const tier of summary.tiers) expect(tier.count).toBeGreaterThan(3);
    expect(summary.totalPrice).toBeGreaterThan(150_000);
    expect(ITEMS.some((item) => item.price >= 5000)).toBe(true);
  });

  it("uses no real brand names", () => {
    const brands = /\b(nike|adidas|puma|reebok|gucci|prada|chanel|dior|rolex|cartier|supreme|jordan|converse|vans|levi|ray-?ban|oakley|louis|vuitton|versace|fendi|balenciaga|tiffany|swarovski)\b/i;
    for (const item of ITEMS) expect(brands.test(item.name), item.name).toBe(false);
  });

  it("every item names a colour its renderer can use, except shapes that take the hair colour", () => {
    for (const item of ITEMS) {
      if (item.slot === "hair" || item.slot === "facialHair" || item.model === "none") continue;
      expect(item.color, item.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("avatars", () => {
  it("a complete avatar costs nothing", () => {
    for (const slot of SLOTS) {
      const value = DEFAULT_AVATAR[slot.key];
      if (value === null) {
        expect(slot.optional).toBe(true);
        continue;
      }
      const item = getItem(value);
      expect(item?.starter, slot.key).toBe(true);
    }
    const free = normalizeAvatar(DEFAULT_AVATAR, new Set());
    expect(free.ok).toBe(true);
  });

  it("has free choices in every required slot", () => {
    for (const slot of SLOTS.filter((entry) => !entry.optional)) {
      expect(itemsForSlot(slot.key).filter((item) => item.starter).length, slot.key).toBeGreaterThan(0);
    }
    expect(STARTER_ITEM_IDS.length).toBeGreaterThanOrEqual(40);
  });

  it("skin tones are free and are not shop items", () => {
    expect(SKIN_TONES.length).toBe(10);
    for (const tone of SKIN_TONES) {
      expect(getItem(tone.id)).toBeNull();
      expect(normalizeAvatar({ ...DEFAULT_AVATAR, skin: tone.id }, new Set()).ok).toBe(true);
    }
  });

  it("a frame never restricts clothing", () => {
    for (const base of BASES) {
      for (const item of itemsForSlot("outfit").filter((entry) => entry.starter)) {
        expect(normalizeAvatar({ ...DEFAULT_AVATAR, base: base.id, outfit: item.id }, new Set()).ok).toBe(true);
      }
    }
  });

  it("refuses anything not sold for that slot", () => {
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, top: "shoes-everyday" })).toEqual({ ok: false, error: "avatar-invalid" });
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, top: "made-up" })).toEqual({ ok: false, error: "avatar-invalid" });
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, skin: "green" })).toEqual({ ok: false, error: "avatar-invalid" });
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, hair: null })).toEqual({ ok: false, error: "avatar-invalid" });
    expect(normalizeAvatar("nope")).toEqual({ ok: false, error: "avatar-invalid" });
  });

  it("refuses a priced item the player does not own", () => {
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, shoes: "shoes-nova-high" }, new Set())).toEqual({ ok: false, error: "item-not-owned" });
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, shoes: "shoes-nova-high" }, new Set(["shoes-nova-high"])).ok).toBe(true);
  });

  it("drops unknown fields", () => {
    const result = normalizeAvatar({ ...DEFAULT_AVATAR, balance: 50000 }, new Set());
    expect(result.ok).toBe(true);
    if (result.ok) expect("balance" in result.avatar).toBe(false);
  });

  it("wearing a top or bottom replaces a dress or suit", () => {
    const dressed = equipItem({ ...DEFAULT_AVATAR }, getItem("outfit-sundress")!);
    expect(dressed.outfit).toBe("outfit-sundress");
    expect(equipItem(dressed, getItem("top-navy")!).outfit).toBeNull();
    expect(equipItem(dressed, getItem("hat-plain-cap")!).outfit).toBe("outfit-sundress");
  });
});

describe("achievements", () => {
  it("have unique keys and plain descriptions", () => {
    expect(new Set(ACHIEVEMENTS.map((item) => item.key)).size).toBe(ACHIEVEMENTS.length);
    for (const item of ACHIEVEMENTS) expect(item.title.length).toBeGreaterThan(3);
  });
});
