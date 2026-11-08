/**
 * Polygon Showdown shop and avatar performance on the running local app: what
 * the shop downloads, how quickly its pictures and the interactive 3D preview
 * appear, and how smooth the turning avatar is. Software WebGL (headless
 * Chromium) is a floor, not a forecast: a real graphics chip does far better.
 *
 *   POLYGON_ACCOUNTS=... node scripts/polygon-showdown-shop-performance.mjs
 */
import { chromium } from "@playwright/test";

const ORIGIN = process.env.POLYGON_SHOWDOWN_URL ?? "http://127.0.0.1:3102";
const account = JSON.parse(process.env.POLYGON_ACCOUNTS).shopper;
const CPU_SLOWDOWN = 4;

// POLYGON_GPU=1 uses this machine's graphics chip instead of software rendering.
const browser = await chromium.launch(process.env.POLYGON_GPU
  ? { headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-features=Vulkan"] }
  : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const resources = new Map();
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.origin !== ORIGIN) return;
    try {
      resources.set(url.pathname, (await response.body()).length);
    } catch {
      /* A redirect has no body. */
    }
  });

  await page.goto(`/sign-in?next=${encodeURIComponent("/games/polygon-showdown/play")}`);
  await page.getByLabel("Email address").fill(account.email);
  await page.locator('input[name="password"]').first().fill(account.password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname === "/games/polygon-showdown/play", { timeout: 120_000 });
  await page.waitForFunction(() => document.body.dataset.screen === "hub", null, { timeout: 60_000 });
  await page.waitForTimeout(3_000);

  // Everything the hub needed is cached; count only what the shop adds.
  resources.clear();
  const started = Date.now();
  await page.evaluate(() => { location.hash = "#shop"; });
  await page.waitForFunction(() => document.body.dataset.screen === "shop");
  const firstPicture = await page.waitForFunction(() => {
    const images = [...document.querySelectorAll(".product-card img")].slice(0, 12);
    return images.length === 12 && images.every((image) => image.complete && image.naturalWidth > 0);
  }, null, { timeout: 60_000, polling: 20 }).then(() => Date.now() - started);
  const stageReady = await page.waitForFunction(() => window.__POLYGON_SHOWDOWN__?.shop?.avatarView?.debug() != null, null, { timeout: 60_000, polling: 20 }).then(() => Date.now() - started);
  await page.waitForTimeout(2_500);

  const scripts = [...resources.entries()].filter(([path]) => path.endsWith(".js"));
  const pictures = [...resources.entries()].filter(([path]) => /\/products\/.+\.(webp|avif)$/.test(path));
  const three = scripts.filter(([path]) => /vendor\/three/.test(path));
  const avatarCode = scripts.filter(([path]) => /\/src\/avatar\//.test(path) || /avatar-preview/.test(path));
  const sum = (entries) => Math.round(entries.reduce((total, [, size]) => total + size, 0) / 1024);
  const kb = (bytes) => Math.round(bytes / 102.4) / 10;

  const previewOpen = Date.now();
  await page.locator('.tab[data-tab="shoes"]').click();
  await page.locator('.product-card[data-item="shoes-golden-apex"]').click();
  await page.waitForFunction(() => window.__POLYGON_SHOWDOWN__.shop.avatarView.debug()?.mode === "product", null, { polling: 16 });
  const previewMs = Date.now() - previewOpen;

  const measureFrames = async (label) => {
    const result = await page.evaluate(() => new Promise((resolve) => {
      const debug = () => window.__POLYGON_SHOWDOWN__.shop.avatarView.debug();
      const startFrames = debug().frames;
      const started = performance.now();
      const stamps = [];
      const loop = (now) => {
        stamps.push(now);
        if (now - started < 6_000) requestAnimationFrame(loop);
        else {
          const elapsed = (now - started) / 1000;
          const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]).sort((a, b) => a - b);
          resolve({ drawnFps: Math.round(((debug().frames - startFrames) / elapsed) * 10) / 10, rafFps: Math.round((stamps.length / elapsed) * 10) / 10, p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)]) });
        }
      };
      requestAnimationFrame(loop);
    }));
    return { label, ...result };
  };

  await page.locator("#detail-close").click();
  await page.waitForTimeout(3_500);
  const fresh = await measureFrames("avatar turning, no throttle");
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  await page.waitForTimeout(1_000);
  const slow = await measureFrames(`avatar turning, ${CPU_SLOWDOWN}x CPU`);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const info = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unknown" };
  });
  console.log(JSON.stringify({
    shopFirst12PicturesMs: firstPicture,
    avatarStageReadyMs: stageReady,
    pictureFilesFirstScreen: pictures.length,
    pictureKbFirstScreen: sum(pictures),
    averagePictureKb: pictures.length ? kb(pictures.reduce((total, [, size]) => total + size, 0) / pictures.length) : 0,
    threeJsKb: sum(three),
    avatarCodeKb: sum(avatarCode),
    openProductTo3dMs: previewMs,
    fresh,
    slow,
    renderer: info.renderer
  }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
