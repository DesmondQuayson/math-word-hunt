/**
 * Writes the shop items from engine/catalog.js into the Polygon Showdown
 * migration (between the seed markers), so the two can never be typed apart.
 * lib/games/polygon-showdown/catalog.test.ts fails if they differ.
 *
 *   node scripts/polygon-showdown-sync-catalog-sql.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ITEMS } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/catalog.js";

const file = fileURLToPath(new URL("../supabase/migrations/20261109100000_polygon_showdown.sql", import.meta.url));
const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const rows = ITEMS.map((item) => `(${quote(item.id)},${quote(item.slot)},${quote(item.name)},${item.price},${quote(item.tier)})`).join(",\n");
const seedStart = "insert into public.polygon_shop_items(item_key,slot,name,price,tier) values\n";
const start = text.indexOf(seedStart);
if (start < 0) throw new Error("Seed marker not found.");
const from = start + seedStart.length;
const to = text.indexOf("\n;\n", from);
if (to < 0) throw new Error("Seed end not found.");
writeFileSync(file, `${text.slice(0, from)}${rows}${text.slice(to)}`);
console.log(`Wrote ${ITEMS.length} shop items into the migration.`);
