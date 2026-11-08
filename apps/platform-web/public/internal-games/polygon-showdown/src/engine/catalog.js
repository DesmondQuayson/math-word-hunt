// Polygon Showdown shop and avatar catalog.
//
// Every item is a virtual cosmetic with a fictional MathNexa-original name, no
// real brands, and no real-money purchases. Prices are in Polygon Coins. The
// database holds the same keys and prices (supabase/migrations, checked by
// catalog.test.ts) and charges from its own copy, never from a browser.
//
// Adding an item is one line here plus one row in a migration. `model`, `color`
// and `accent` tell the avatar renderer how to draw it.

const item = (slot, id, name, price, tier, model, color, accent) => Object.freeze({ id, slot, name, price, tier, starter: price === 0, model, color, accent: accent ?? null });
const group = (slot, rows) => rows.map((row) => item(slot, ...row));

export const TIERS = Object.freeze(["starter", "basic", "mid", "premium", "rare", "luxury", "legendary"]);
export const TIER_LABELS = Object.freeze({ starter: "Free", basic: "Basic", mid: "Mid-tier", premium: "Premium", rare: "Rare", luxury: "Luxury", legendary: "Legendary" });

/** Free, always. Natural skin tones are never for sale. */
export const SKIN_TONES = Object.freeze([
  Object.freeze({ id: "skin-1", label: "Skin tone 1", color: "#FBE2CF" }),
  Object.freeze({ id: "skin-2", label: "Skin tone 2", color: "#F3CFB3" }),
  Object.freeze({ id: "skin-3", label: "Skin tone 3", color: "#E5B48F" }),
  Object.freeze({ id: "skin-4", label: "Skin tone 4", color: "#D39B72" }),
  Object.freeze({ id: "skin-5", label: "Skin tone 5", color: "#BC8158" }),
  Object.freeze({ id: "skin-6", label: "Skin tone 6", color: "#A06A43" }),
  Object.freeze({ id: "skin-7", label: "Skin tone 7", color: "#845333" }),
  Object.freeze({ id: "skin-8", label: "Skin tone 8", color: "#6B4128" }),
  Object.freeze({ id: "skin-9", label: "Skin tone 9", color: "#533120" }),
  Object.freeze({ id: "skin-10", label: "Skin tone 10", color: "#3D2318" })
]);

/** Body shape only. Every item fits both; nothing is locked to one. */
export const BASES = Object.freeze([
  Object.freeze({ id: "base-a", label: "Straight frame" }),
  Object.freeze({ id: "base-b", label: "Curved frame" })
]);

export const SLOTS = Object.freeze([
  Object.freeze({ key: "hair", label: "Hairstyle", tab: "hair", optional: false }),
  Object.freeze({ key: "hairColor", label: "Hair Color", tab: "hair", optional: false }),
  Object.freeze({ key: "facialHair", label: "Facial Hair", tab: "facial-hair", optional: false }),
  Object.freeze({ key: "lipstick", label: "Lipstick", tab: "makeup", optional: false }),
  Object.freeze({ key: "eyeShadow", label: "Eye Shadow", tab: "makeup", optional: false }),
  Object.freeze({ key: "blush", label: "Blush", tab: "makeup", optional: false }),
  Object.freeze({ key: "eyeliner", label: "Eyeliner", tab: "makeup", optional: false }),
  Object.freeze({ key: "top", label: "Top", tab: "tops", optional: false }),
  Object.freeze({ key: "bottom", label: "Bottom", tab: "bottoms", optional: false }),
  Object.freeze({ key: "outfit", label: "Dress or Suit", tab: "dresses", optional: true }),
  Object.freeze({ key: "jacket", label: "Jacket", tab: "jackets", optional: true }),
  Object.freeze({ key: "shoes", label: "Shoes", tab: "shoes", optional: false }),
  Object.freeze({ key: "hat", label: "Hat", tab: "hats", optional: true }),
  Object.freeze({ key: "glasses", label: "Glasses", tab: "glasses", optional: true }),
  Object.freeze({ key: "jewelry", label: "Jewelry", tab: "jewelry", optional: true })
]);

export const SHOP_TABS = Object.freeze([
  Object.freeze({ key: "tops", label: "Tops" }),
  Object.freeze({ key: "bottoms", label: "Bottoms" }),
  Object.freeze({ key: "dresses", label: "Dresses & Suits" }),
  Object.freeze({ key: "jackets", label: "Jackets" }),
  Object.freeze({ key: "shoes", label: "Shoes" }),
  Object.freeze({ key: "hats", label: "Hats" }),
  Object.freeze({ key: "glasses", label: "Glasses" }),
  Object.freeze({ key: "jewelry", label: "Jewelry" }),
  Object.freeze({ key: "hair", label: "Hair" }),
  Object.freeze({ key: "facial-hair", label: "Facial Hair" }),
  Object.freeze({ key: "makeup", label: "Makeup" })
]);

export const ITEMS = Object.freeze([
  ...group("top", [
    ["top-everyday", "Everyday Tee", 0, "starter", "tee", "#20CFE3"],
    ["top-navy", "Navy Basic Tee", 0, "starter", "tee", "#24406B"],
    ["top-long-gray", "Soft Long Sleeve", 0, "starter", "long", "#9AA7B8"],
    ["top-sunrise", "Sunrise Tee", 25, "basic", "tee", "#FFB627"],
    ["top-pink-pop", "Pink Pop Tee", 25, "basic", "tee", "#FF4F9A"],
    ["top-breeze", "Striped Breeze Tee", 35, "basic", "tee", "#EAF6FF", "#3478D8"],
    ["top-bolt", "Bolt Print Tee", 50, "basic", "tee", "#1C2F4D", "#FFD23F"],
    ["top-prism-polo", "Prism Polo", 60, "basic", "polo", "#3DD979", "#FFFFFF"],
    ["top-hex-hoodie", "Hex Hoodie", 180, "mid", "hoodie", "#5B4BD6", "#20CFE3"],
    ["top-angle-knit", "Angle Knit Sweater", 240, "mid", "sweater", "#D9534F", "#FBE9D7"],
    ["top-grid-flannel", "Grid Flannel", 300, "mid", "long", "#B23A48", "#26324A"],
    ["top-aurora-blouse", "Aurora Silk Blouse", 600, "premium", "long", "#7FE5D0", "#E4B5FF"],
    ["top-comet-hoodie", "Comet Trail Hoodie", 1500, "rare", "hoodie", "#101C33", "#FF4F9A"],
    ["top-starfield", "Starfield Couture Top", 4000, "luxury", "long", "#0D1B3E", "#FFE08A"]
  ]),
  ...group("bottom", [
    ["bottom-jeans", "Classic Jeans", 0, "starter", "pants", "#37588C"],
    ["bottom-joggers", "Everyday Joggers", 0, "starter", "pants", "#4A5568"],
    ["bottom-simple-skirt", "Simple Skirt", 0, "starter", "skirt", "#2F4A7A"],
    ["bottom-trail-shorts", "Trail Shorts", 30, "basic", "shorts", "#8A7A5C"],
    ["bottom-denim-shorts", "Denim Shorts", 40, "basic", "shorts", "#5C86C4"],
    ["bottom-pleated", "Pleated Skirt", 60, "basic", "skirt", "#A23B72"],
    ["bottom-cargo", "Cargo Pants", 75, "basic", "pants", "#667A4F"],
    ["bottom-tristripe", "Tri-Stripe Track Pants", 150, "mid", "pants", "#15233C", "#20CFE3"],
    ["bottom-midnight-chinos", "Midnight Chinos", 200, "mid", "pants", "#1F2A44"],
    ["bottom-wave-skirt", "Wave Skirt", 260, "mid", "skirt", "#1D9BB2", "#BFF3FA"],
    ["bottom-velvet", "Velvet Trousers", 650, "premium", "pants", "#5B1A5E"],
    ["bottom-nebula", "Nebula Joggers", 1400, "rare", "pants", "#27125C", "#FF7BC0"],
    ["bottom-gilded-pleat", "Gilded Pleat Skirt", 3500, "luxury", "skirt", "#C99A2E", "#FFF1B8"]
  ]),
  ...group("outfit", [
    ["outfit-sundress", "Simple Sundress", 0, "starter", "dress", "#FFB5C8"],
    ["outfit-starter-suit", "Starter Suit", 0, "starter", "suit", "#34435E", "#FFFFFF"],
    ["outfit-picnic", "Picnic Dress", 75, "basic", "dress", "#7BC47F"],
    ["outfit-garden-wrap", "Garden Wrap Dress", 320, "mid", "dress", "#D6547A", "#FFE1E8"],
    ["outfit-smart-suit", "Smart Casual Suit", 380, "mid", "suit", "#6B7C93", "#EAF0F7"],
    ["outfit-evening-gala", "Evening Gala Dress", 750, "premium", "gown", "#1E2A78", "#C6D3FF"],
    ["outfit-midnight-suit", "Midnight Tailored Suit", 750, "premium", "suit", "#10182E", "#FF4F9A"],
    ["outfit-emerald-three", "Emerald Three-Piece", 2500, "rare", "suit", "#0F6B50", "#E6F7EE"],
    ["outfit-prism-gown", "Prism Ball Gown", 3000, "rare", "gown", "#8F6BFF", "#7CEBF7"],
    ["outfit-moonlight", "Moonlight Couture Gown", 8000, "luxury", "gown", "#D9E4FF", "#8FA8E8"],
    ["outfit-golden-regalia", "Golden Ratio Regalia", 15000, "legendary", "suit", "#C89B2C", "#FFF6CF"],
    ["outfit-celestial", "Celestial Gown", 20000, "legendary", "gown", "#180F45", "#FFD86B"]
  ]),
  ...group("jacket", [
    ["jacket-windbreaker", "Light Windbreaker", 70, "basic", "windbreaker", "#2E9CCA"],
    ["jacket-denim-trucker", "Denim Trucker", 220, "mid", "trucker", "#44679E"],
    ["jacket-varsity", "Varsity Vector", 350, "mid", "varsity", "#7A1F3D", "#F2EDE4"],
    ["jacket-neon-bomber", "Neon Bomber", 500, "premium", "bomber", "#161E33", "#20CFE3"],
    ["jacket-moto", "Midnight Moto", 720, "premium", "moto", "#20242E", "#BAC2CF"],
    ["jacket-galaxy-puffer", "Galaxy Puffer", 2200, "rare", "puffer", "#32206E", "#7CEBF7"],
    ["jacket-silver-frost", "Silver Frost Parka", 5000, "luxury", "puffer", "#C7D2E0", "#FFFFFF"],
    ["jacket-phoenix", "Phoenix Flame Coat", 12000, "legendary", "coat", "#C8321E", "#FFC247"]
  ]),
  ...group("shoes", [
    ["shoes-everyday", "Everyday Sneakers", 0, "starter", "sneaker", "#F2F5F9", "#20CFE3"],
    ["shoes-simple-flats", "Simple Flats", 0, "starter", "flat", "#3C4A63"],
    ["shoes-canvas", "Canvas Lows", 40, "basic", "sneaker", "#D94F5C", "#FFFFFF"],
    ["shoes-slipons", "Trail Slip-Ons", 45, "basic", "flat", "#7E6A4F"],
    ["shoes-bright-laces", "Bright Lace Sneakers", 60, "basic", "sneaker", "#232E45", "#FFD23F"],
    ["shoes-comet", "Comet Runners", 250, "mid", "sneaker", "#6E5BFF", "#FF4F9A"],
    ["shoes-urban-boots", "Urban Boots", 300, "mid", "boot", "#5A4632"],
    ["shoes-nova-high", "Nova High-Top Sneakers", 350, "mid", "hightop", "#FFFFFF", "#FF4F9A"],
    ["shoes-cloudstep", "Cloudstep Platforms", 600, "premium", "platform", "#E8EEF9", "#8F6BFF"],
    ["shoes-lightning", "Lightning Kicks", 1800, "rare", "hightop", "#141C30", "#FFD23F"],
    ["shoes-stardust-heels", "Stardust Heels", 4000, "luxury", "heel", "#2A2350", "#FFE08A"],
    ["shoes-golden-apex", "Golden Apex Sneakers", 10000, "legendary", "hightop", "#D9A92F", "#FFF6CF"]
  ]),
  ...group("hat", [
    ["hat-plain-cap", "Plain Cap", 0, "starter", "cap", "#24406B"],
    ["hat-beanie", "Cozy Beanie", 60, "basic", "beanie", "#C65A5A"],
    ["hat-bucket", "Sun Bucket Hat", 70, "basic", "bucket", "#E7D7B1"],
    ["hat-snapback", "Snapback Cap", 75, "basic", "cap", "#FF4F9A", "#FFFFFF"],
    ["hat-neon-visor", "Neon Visor", 150, "mid", "visor", "#20CFE3"],
    ["hat-fedora", "Explorer Fedora", 200, "mid", "fedora", "#7B5B3A", "#2B2118"],
    ["hat-wide-sunhat", "Wide Brim Sunhat", 550, "premium", "sunhat", "#F3E2BA", "#D6547A"],
    ["hat-wizard", "Wizard Cone", 1600, "rare", "cone", "#2B1D6B", "#FFD86B"],
    ["hat-polygon-crown", "Polygon Crown", 6000, "luxury", "crown", "#E6B93A", "#FF4F9A"],
    ["hat-supernova-halo", "Supernova Halo", 25000, "legendary", "halo", "#FFE9A8", "#20CFE3"]
  ]),
  ...group("glasses", [
    ["glasses-round", "Round Readers", 0, "starter", "round", "#2B3244"],
    ["glasses-retro", "Retro Squares", 50, "basic", "square", "#7A3E9D"],
    ["glasses-shades", "Classic Shades", 60, "basic", "shades", "#1A1F2B"],
    ["glasses-aviator", "Aviator Frames", 180, "mid", "aviator", "#C9A44C"],
    ["glasses-neon", "Neon Edge Frames", 260, "mid", "square", "#20CFE3"],
    ["glasses-hex", "Hex Frames", 520, "premium", "hex", "#FF4F9A"],
    ["glasses-starlight", "Starlight Shades", 1200, "rare", "shades", "#3B1E78", "#FFE08A"],
    ["glasses-diamond", "Diamond-Cut Frames", 3000, "luxury", "hex", "#DCEBFF", "#FFFFFF"]
  ]),
  ...group("jewelry", [
    ["jewelry-studs", "Stud Earrings", 0, "starter", "studs", "#E8EEF9"],
    ["jewelry-bead-bracelet", "Bead Bracelet", 30, "basic", "bracelet", "#20CFE3"],
    ["jewelry-hoops", "Hoop Earrings", 45, "basic", "hoops", "#D9B44A"],
    ["jewelry-simple-chain", "Simple Chain", 55, "basic", "chain", "#C7CFDB"],
    ["jewelry-turquoise-pendant", "Turquoise Pendant", 190, "mid", "pendant", "#C7CFDB", "#20CFE3"],
    ["jewelry-sport-watch", "Sport Watch", 230, "mid", "watch", "#222B3F", "#20CFE3"],
    ["jewelry-layered-chain", "Layered Chain", 300, "mid", "chain", "#D9B44A", "#D9B44A"],
    ["jewelry-pearls", "Pearl Necklace", 700, "premium", "pearls", "#F6F1E7"],
    ["jewelry-prism-pendant", "Prism Pendant", 2000, "rare", "pendant", "#E6B93A", "#C9B8FF"],
    ["jewelry-golden-hoops", "Golden Hoops Deluxe", 3200, "luxury", "hoops", "#F2C14E", "#FFF1B8"],
    ["jewelry-platinum-chrono", "Platinum Chrono", 4500, "luxury", "watch", "#D7DEE9", "#8F6BFF"],
    ["jewelry-infinity", "Infinity Medallion", 8000, "legendary", "pendant", "#FFD86B", "#FF4F9A"]
  ]),
  ...group("hair", [
    ["hair-bald", "Shaved", 0, "starter", "bald"],
    ["hair-short", "Short Crop", 0, "starter", "short"],
    ["hair-long", "Long Layers", 0, "starter", "long"],
    ["hair-curly", "Natural Curls", 0, "starter", "curly"],
    ["hair-straight", "Straight Cut", 0, "starter", "straight"],
    ["hair-braids", "Braids", 0, "starter", "braids"],
    ["hair-locs", "Locs", 0, "starter", "locs"],
    ["hair-afro", "Afro", 0, "starter", "afro"],
    ["hair-fade", "Fade", 0, "starter", "fade"],
    ["hair-bun", "Top Bun", 0, "starter", "bun"],
    ["hair-ponytail", "Ponytail", 0, "starter", "ponytail"],
    ["hair-twin-buns", "Twin Buns", 160, "mid", "twinbuns"],
    ["hair-high-puff", "High Puff", 180, "mid", "puff"],
    ["hair-long-twists", "Long Twists", 220, "mid", "locslong"],
    ["hair-crown-braids", "Crown Braids", 650, "premium", "crownbraids"],
    ["hair-waterfall-locs", "Waterfall Locs", 700, "premium", "locslong"],
    ["hair-cosmic-coils", "Cosmic Coils", 1000, "rare", "coils"],
    ["hair-starlight-mohawk", "Starlight Mohawk", 1500, "rare", "mohawk"],
    ["hair-aurora-waves", "Aurora Waves", 2000, "rare", "waves"],
    ["hair-regal-updo", "Regal Updo", 2500, "luxury", "updo"],
    ["hair-supernova-afro", "Supernova Afro", 6000, "legendary", "afrobig"]
  ]),
  ...group("hairColor", [
    ["hc-black", "Black", 0, "starter", "solid", "#17120F"],
    ["hc-dark-brown", "Dark Brown", 0, "starter", "solid", "#3A2415"],
    ["hc-brown", "Brown", 0, "starter", "solid", "#6B4226"],
    ["hc-auburn", "Auburn", 0, "starter", "solid", "#8C3B1E"],
    ["hc-dark-blonde", "Dark Blonde", 0, "starter", "solid", "#A67C42"],
    ["hc-blonde", "Blonde", 0, "starter", "solid", "#E0BE72"],
    ["hc-gray", "Silver Gray", 0, "starter", "solid", "#A9AEB7"],
    ["hc-white", "White", 0, "starter", "solid", "#EEF0F3"],
    ["hc-turquoise", "Turquoise Tide", 80, "basic", "solid", "#20CFE3"],
    ["hc-pink", "Bubblegum Pink", 80, "basic", "solid", "#FF7BB5"],
    ["hc-violet", "Violet Haze", 120, "mid", "solid", "#8F6BFF"],
    ["hc-copper", "Sunset Copper", 150, "mid", "solid", "#E2703A"],
    ["hc-prism-silver", "Prism Silver", 500, "premium", "metal", "#DCE6F5"],
    ["hc-molten-gold", "Molten Gold", 1000, "rare", "metal", "#F0BE3C"]
  ]),
  ...group("facialHair", [
    ["fh-none", "Clean-Shaven", 0, "starter", "none"],
    ["fh-mustache", "Mustache", 0, "starter", "mustache"],
    ["fh-short-beard", "Short Beard", 0, "starter", "shortbeard"],
    ["fh-goatee", "Goatee", 40, "basic", "goatee"],
    ["fh-full-beard", "Full Beard", 60, "basic", "fullbeard"],
    ["fh-curled-mustache", "Curled Mustache", 140, "mid", "curledmustache"],
    ["fh-sculpted-goatee", "Sculpted Goatee", 170, "mid", "sculptedgoatee"],
    ["fh-royal-beard", "Royal Beard", 520, "premium", "royalbeard"]
  ]),
  ...group("lipstick", [
    ["lip-none", "No Lipstick", 0, "starter", "none"],
    ["lip-natural", "Natural Tint", 0, "starter", "lip", "#B86A62"],
    ["lip-rose", "Rose Petal", 25, "basic", "lip", "#D6547A"],
    ["lip-berry", "Berry Crush", 30, "basic", "lip", "#8E2B59"],
    ["lip-coral", "Coral Reef", 30, "basic", "lip", "#F2705D"],
    ["lip-crimson", "Crimson Velvet", 120, "mid", "lip", "#A5142B"],
    ["lip-galaxy", "Galaxy Gloss", 500, "premium", "gloss", "#6A3FD0"]
  ]),
  ...group("eyeShadow", [
    ["shadow-none", "No Eye Shadow", 0, "starter", "none"],
    ["shadow-peach", "Soft Peach", 30, "basic", "shadow", "#F4B39A"],
    ["shadow-sky", "Sky Shimmer", 40, "basic", "shadow", "#8CC8F5"],
    ["shadow-emerald", "Emerald Smoke", 150, "mid", "shadow", "#2F9E6E"],
    ["shadow-aurora", "Aurora Glow", 520, "premium", "shadow", "#B38BFF"],
    ["shadow-diamond", "Diamond Dust", 2500, "luxury", "glitter", "#E6F0FF"]
  ]),
  ...group("blush", [
    ["blush-none", "No Blush", 0, "starter", "none"],
    ["blush-peony", "Peony Blush", 25, "basic", "blush", "#F08AA6"],
    ["blush-apricot", "Apricot Blush", 25, "basic", "blush", "#F4A67A"],
    ["blush-sunset", "Sunset Glow", 120, "mid", "blush", "#E9636A"]
  ]),
  ...group("eyeliner", [
    ["liner-none", "No Eyeliner", 0, "starter", "none"],
    ["liner-soft", "Soft Black Liner", 25, "basic", "liner", "#1B1B22"],
    ["liner-winged", "Winged Liner", 130, "mid", "winged", "#14141A"],
    ["liner-electric", "Electric Blue Wing", 500, "premium", "winged", "#1F6BFF"]
  ])
]);

const ITEM_BY_ID = new Map(ITEMS.map((entry) => [entry.id, entry]));

export function getItem(id) {
  return typeof id === "string" ? ITEM_BY_ID.get(id) ?? null : null;
}

export function itemsForSlot(slot) {
  return ITEMS.filter((entry) => entry.slot === slot);
}

export function itemsForTab(tab) {
  const slots = new Set(SLOTS.filter((slot) => slot.tab === tab).map((slot) => slot.key));
  return ITEMS.filter((entry) => slots.has(entry.slot));
}

export const STARTER_ITEM_IDS = Object.freeze(ITEMS.filter((entry) => entry.starter).map((entry) => entry.id));

/** A complete avatar from free items only. Nobody starts unfinished. */
export const DEFAULT_AVATAR = Object.freeze({
  base: "base-a",
  skin: "skin-5",
  hair: "hair-short",
  hairColor: "hc-black",
  facialHair: "fh-none",
  lipstick: "lip-none",
  eyeShadow: "shadow-none",
  blush: "blush-none",
  eyeliner: "liner-none",
  top: "top-everyday",
  bottom: "bottom-jeans",
  outfit: null,
  jacket: null,
  shoes: "shoes-everyday",
  hat: null,
  glasses: null,
  jewelry: null
});

const SKIN_IDS = new Set(SKIN_TONES.map((tone) => tone.id));
const BASE_IDS = new Set(BASES.map((base) => base.id));

/**
 * A clean avatar from untrusted input, field by field: only known keys, each
 * one a real item for that slot. `owned` (a Set of item ids) decides whether a
 * priced item may be worn; a free item always may.
 */
export function normalizeAvatar(raw, owned = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "avatar-invalid" };
  const avatar = {};
  if (!BASE_IDS.has(raw.base)) return { ok: false, error: "avatar-invalid" };
  avatar.base = raw.base;
  if (!SKIN_IDS.has(raw.skin)) return { ok: false, error: "avatar-invalid" };
  avatar.skin = raw.skin;
  for (const slot of SLOTS) {
    const value = raw[slot.key] ?? null;
    if (value === null) {
      if (!slot.optional) return { ok: false, error: "avatar-invalid" };
      avatar[slot.key] = null;
      continue;
    }
    const entry = getItem(value);
    if (!entry || entry.slot !== slot.key) return { ok: false, error: "avatar-invalid" };
    if (!entry.starter && owned && !owned.has(entry.id)) return { ok: false, error: "item-not-owned" };
    avatar[slot.key] = entry.id;
  }
  return { ok: true, avatar };
}

/** The avatar with a slot set to an item, following the wardrobe rules. */
export function equipItem(avatar, entry) {
  const next = { ...avatar, [entry.slot]: entry.id };
  if (entry.slot === "top" || entry.slot === "bottom") next.outfit = null;
  return next;
}

/** Counts and typical prices per tier, for the economy simulation. */
export function catalogSummary() {
  const tiers = TIERS.filter((tier) => tier !== "starter").map((tier) => {
    const prices = ITEMS.filter((entry) => entry.tier === tier).map((entry) => entry.price).sort((a, b) => a - b);
    return { tier, count: prices.length, min: prices[0], max: prices[prices.length - 1], typicalPrice: prices[Math.floor(prices.length / 2)] };
  });
  return { tiers, count: ITEMS.length, totalPrice: ITEMS.reduce((sum, entry) => sum + entry.price, 0) };
}
