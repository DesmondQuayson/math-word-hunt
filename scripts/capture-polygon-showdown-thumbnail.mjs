/**
 * Captures the Polygon Showdown catalog artwork from REAL gameplay on the
 * running local app: a free account plays Solo, and the shot is taken with the
 * shapes of a real match mid-break. The board on screen is checked first: it
 * must hold all four shapes, and the numbers shown must be the game's own.
 * Writes apps/platform-web/public/media/games/polygon-showdown.{webp,avif}
 * (1200x675) and qa-artifacts/polygon-showdown/thumbnail-audit.json.
 *
 *   node scripts/run-polygon-showdown.mjs thumbnail
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

import { allLegalMoves, decodeBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = process.env.POLYGON_SHOWDOWN_URL ?? "http://127.0.0.1:3102";
const accounts = JSON.parse(process.env.POLYGON_ACCOUNTS ?? "{}");
const account = accounts.owner;
assert.ok(account?.password, "POLYGON_ACCOUNTS is required");

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1200, height: 675 } });
  const page = await context.newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent("/games/polygon-showdown/play")}`);
  await page.getByLabel("Email address").fill(account.email);
  await page.locator('input[name="password"]').first().fill(account.password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname === "/games/polygon-showdown/play", { timeout: 120_000 });
  await page.goto("/games/polygon-showdown/play#solo-new");
  await page.waitForFunction(() => document.body.dataset.screen === "solo", null, { timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector(".board")?.classList.contains("locked"));

  const readState = () => page.evaluate(() => window.__POLYGON_SHOWDOWN__.solo.game.state);
  const legal = (state) => allLegalMoves(decodeBoard(state.board), 8, 8);

  // A little real play, so the coin counter and score are real too.
  for (let index = 0; index < 8; index += 1) {
    await page.waitForFunction(() => !window.__POLYGON_SHOWDOWN__.solo.game.busy);
    const state = await readState();
    const [a, b] = legal(state)[0];
    await page.locator(`.cell[data-cell="${a}"]`).click();
    await page.locator(`.cell[data-cell="${b}"]`).click();
    await page.waitForFunction((count) => window.__POLYGON_SHOWDOWN__.solo.game.state.moves > count, state.moves);
  }
  await page.waitForFunction(() => !window.__POLYGON_SHOWDOWN__.solo.game.busy);

  // One more real swap, frozen in the instant its shapes are breaking.
  const before = await readState();
  const [a, b] = legal(before)[0];
  await page.locator(`.cell[data-cell="${a}"]`).click();
  await page.locator(`.cell[data-cell="${b}"]`).click();
  const froze = await page.evaluate(() => new Promise((resolveFrozen) => {
    const started = performance.now();
    const watch = () => {
      const breaking = document.getAnimations().filter((animation) => {
        const frames = animation.effect?.getKeyframes?.() ?? [];
        return frames.some((frame) => typeof frame.filter === "string" && frame.filter.includes("brightness(1.7)"));
      });
      if (breaking.length) {
        for (const animation of document.getAnimations()) animation.pause();
        for (const animation of breaking) animation.currentTime = 95;
        resolveFrozen(breaking.length);
        return;
      }
      if (performance.now() - started > 4000) resolveFrozen(0);
      else requestAnimationFrame(watch);
    };
    watch();
  }));
  assert.ok(froze >= 3, "no match was caught mid-break");
  await page.waitForTimeout(160);

  const audit = await page.evaluate(() => {
    const kinds = {};
    for (const tile of document.querySelectorAll(".tile")) {
      const key = [...tile.classList].find((name) => name.startsWith("tile-"));
      kinds[key] = (kinds[key] ?? 0) + 1;
    }
    return { kinds, coins: document.getElementById("run-coins").textContent, score: document.getElementById("run-score").textContent, board: window.__POLYGON_SHOWDOWN__.solo.game.state.board };
  });
  for (const key of ["tile-circle", "tile-triangle", "tile-square", "tile-rectangle"]) assert.ok(audit.kinds[key] > 0, `${key} missing from the frame`);

  const shot = await page.screenshot({ type: "png" });
  mkdirSync("qa-artifacts/polygon-showdown", { recursive: true });
  const directory = resolve("apps/platform-web/public/media/games");
  const webp = await sharp(shot).resize(1200, 675).webp({ quality: 84 }).toBuffer();
  const avif = await sharp(shot).resize(1200, 675).avif({ quality: 58 }).toBuffer();
  writeFileSync(resolve(directory, "polygon-showdown.webp"), webp);
  writeFileSync(resolve(directory, "polygon-showdown.avif"), avif);
  writeFileSync("qa-artifacts/polygon-showdown/thumbnail-audit.json", JSON.stringify({
    capturedFrom: "real Solo gameplay on the local owner review",
    breakingTiles: froze,
    ...audit,
    sha256: { webp: createHash("sha256").update(webp).digest("hex"), avif: createHash("sha256").update(avif).digest("hex") }
  }, null, 2));
  console.log(`Thumbnail captured: ${froze} shapes mid-break; ${JSON.stringify(audit.kinds)}`);
  await context.close();
} finally {
  await browser.close();
}
