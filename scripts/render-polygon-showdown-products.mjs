/**
 * Renders every Polygon Showdown shop item from its real 3D asset.
 *
 * Runs the same figure and the same catalog entry that Try On and Equip use, in
 * headless Chromium, and writes optimized stills next to the game. Nothing here
 * draws a picture of an item: if the renderer changes, re-run this and the
 * images change with it (lib/games/polygon-showdown/product-images.test.ts fails
 * until they do).
 *
 *   node scripts/render-polygon-showdown-products.mjs            all items
 *   node scripts/render-polygon-showdown-products.mjs --only shoes-nova-high,hat-wizard
 *   node scripts/render-polygon-showdown-products.mjs --sheet out.png   also a contact sheet
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

import { ITEMS } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/catalog.js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC = resolve("apps/platform-web/public");
const GAME = join(PUBLIC, "internal-games/polygon-showdown");
const OUT = join(GAME, "products");
const AVATAR = join(GAME, "src/avatar");
const VERSION_FILE = join(GAME, "src/product-images.js");
const RENDER_SIZE = 800;
const SIZES = [200, 400];

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};
const only = option("only")?.split(",") ?? null;
const sheetPath = option("sheet");

/** Changes whenever a product could look different: its definition or the renderer. */
function sourceHash() {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(ITEMS));
  const catalog = readFileSync(join(GAME, "src/engine/catalog.js"), "utf8").replace(/\r\n/g, "\n");
  hash.update(catalog);
  for (const name of readdirSync(AVATAR).filter((file) => file.endsWith(".js")).sort()) {
    hash.update(name);
    hash.update(readFileSync(join(AVATAR, name), "utf8").replace(/\r\n/g, "\n"));
  }
  return hash.digest("hex");
}

const MIME = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".mp3": "audio/mpeg", ".bin": "application/octet-stream" };
const STUDIO_HTML = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}#stage{width:${RENDER_SIZE}px;height:${RENDER_SIZE}px}</style><div id="stage"></div>
<script type="module">
import { createAvatarStage } from "/internal-games/polygon-showdown/src/avatar/stage.js";
import { getItem } from "/internal-games/polygon-showdown/src/engine/catalog.js";
const stage = createAvatarStage(document.getElementById("stage"), { interactive: false, autoRotate: false, pixelRatio: 1 });
window.ready = stage.available;
window.capture = (id, distance) => stage.capture(getItem(id), distance);
window.measure = (id) => stage.measure(getItem(id));
</script>`;

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (path === "/studio.html") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(STUDIO_HTML);
    return;
  }
  const file = normalize(join(PUBLIC, path));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const list = only ? ITEMS.filter((item) => only.includes(item.id)) : ITEMS;
const stills = [];
const categoryDistance = new Map();
const viewGroup = (item) => (["lipstick", "eyeShadow", "blush", "eyeliner"].includes(item.slot) ? "makeup" : item.slot === "jewelry" ? `jewelry-${item.model}` : item.slot);
let bytes = 0;
try {
  const page = await browser.newPage({ viewport: { width: RENDER_SIZE, height: RENDER_SIZE } });
  page.on("pageerror", (error) => console.error("page error:", error.message));
  await page.goto(`${origin}/studio.html`);
  await page.waitForFunction(() => window.ready !== undefined);
  if (!(await page.evaluate(() => window.ready))) throw new Error("WebGL is not available in this browser.");
  // One camera distance per category, so a beanie and a top hat share a scale.
  // The largest few still get a little more room rather than being cut off.
  const measured = await page.evaluate((ids) => ids.map((id) => window.measure(id)), ITEMS.map((item) => item.id));
  const byGroup = new Map();
  for (const entry of measured) {
    const key = viewGroup(ITEMS.find((item) => item.id === entry.id));
    byGroup.set(key, [...(byGroup.get(key) ?? []), entry.distance]);
  }
  for (const [key, values] of byGroup) {
    values.sort((a, b) => a - b);
    categoryDistance.set(key, values[Math.floor(values.length * 0.5)]);
  }
  if (args.includes("--distances")) console.log(JSON.stringify(Object.fromEntries(byGroup.entries()), (key, value) => (typeof value === "number" ? Number(value.toFixed(2)) : value)));
  for (const item of list) {
    const url = await page.evaluate(([id, distance]) => window.capture(id, distance), [item.id, categoryDistance.get(viewGroup(item)) ?? 0]);
    const png = Buffer.from(url.split(",")[1], "base64");
    stills.push({ item, png });
    for (const size of SIZES) {
      const resized = sharp(png).resize(size, size, { kernel: "lanczos3" });
      const webp = await resized.clone().webp({ quality: 82, alphaQuality: 90, effort: 5 }).toBuffer();
      const avif = await resized.clone().avif({ quality: 58, effort: 5 }).toBuffer();
      writeFileSync(join(OUT, `${item.id}-${size}.webp`), webp);
      writeFileSync(join(OUT, `${item.id}-${size}.avif`), avif);
      bytes += webp.length + avif.length;
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (!only) {
  const version = sourceHash();
  writeFileSync(VERSION_FILE, `// Generated by scripts/render-polygon-showdown-products.mjs. Do not edit.\n// A hash of the catalog and the avatar renderer that produced the product images.\nexport const PRODUCT_RENDER_SOURCE = "${version}";\nexport const PRODUCT_IMAGE_VERSION = "${version.slice(0, 12)}";\n`);
  console.log(`Source hash ${version}`);
}
console.log(`Rendered ${list.length} products, ${(bytes / 1024 / 1024).toFixed(2)} MB across ${list.length * SIZES.length * 2} files.`);

if (sheetPath) {
  const tile = 200;
  const columns = 8;
  const rows = Math.ceil(stills.length / columns);
  const composites = await Promise.all(stills.map(async ({ png }, index) => ({
    input: await sharp(png).resize(tile, tile).png().toBuffer(),
    left: (index % columns) * tile,
    top: Math.floor(index / columns) * tile
  })));
  await sharp({ create: { width: columns * tile, height: rows * tile, channels: 4, background: { r: 232, g: 236, b: 243, alpha: 1 } } }).composite(composites).png().toFile(sheetPath);
}
