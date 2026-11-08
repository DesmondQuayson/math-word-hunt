/**
 * Polygon Showdown performance check on the running local app: what a player's
 * browser downloads to reach a Showdown board, that the 3D renderer is not part
 * of it, and how smooth a run of real moves is on a CPU slowed to school-laptop
 * speed. Uses the /join screen: the path a guest on a shared Chromebook takes.
 *
 *   node scripts/polygon-showdown-performance.mjs   (needs POLYGON_SHOWDOWN_URL and a Showdown code from --code, or creates none)
 */
import { createHash, randomBytes } from "node:crypto";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { allLegalMoves, CONFIG, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const ORIGIN = process.env.POLYGON_SHOWDOWN_URL ?? "http://127.0.0.1:3102";
const CPU_SLOWDOWN = 4;
const MOVES = 14;

const admin = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const hashToken = (kind, token) => createHash("sha256").update(`polygon-showdown\n${kind}\n${token}`).digest("hex");

const seed = randomBytes(16).toString("hex");
const code = String(100000 + Math.floor(Math.random() * 899999));
const owner = createHash("sha256").update(`perf-${seed}`).digest("hex");
const hostToken = randomBytes(32).toString("base64url");
const created = await admin.rpc("polygon_create_room", {
  p_code: code, p_owner_hash: owner, p_host_token_hash: hashToken("host", hostToken), p_player_token_hash: hashToken("player", randomBytes(32).toString("base64url")),
  p_user: null, p_name: "Creator", p_emoji: null, p_duration: 300, p_seed: seed, p_state: newGameState(encodeBoard(startingBoard(seed)), CONFIG, SCHEDULES.standard)
});
if (created.error) throw created.error;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const resources = new Map();
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.origin !== ORIGIN) return;
    try {
      const body = await response.body();
      resources.set(url.pathname, body.length);
    } catch {
      /* A redirect has no body. */
    }
  });

  await page.goto(`/join?code=${code}`);
  await page.locator("#name").fill("Speedy");
  await page.locator("#join-game").click();
  await page.waitForFunction(() => document.body.dataset.screen === "lobby");
  const start = await admin.rpc("polygon_host_command", { p_owner_hash: owner, p_token_hash: hashToken("host", hostToken), p_command: "start", p_args: {} });
  if (start.error) throw start.error;
  await page.waitForFunction(() => document.body.dataset.screen === "showdown", null, { polling: 150 });
  await page.waitForFunction(() => !document.querySelector(".board")?.classList.contains("locked"), null, { polling: 150, timeout: 20_000 });

  const client = await context.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const loop = (now) => {
      window.__frames.push(now - last);
      last = now;
      window.__frameLoop = requestAnimationFrame(loop);
    };
    window.__frameLoop = requestAnimationFrame(loop);
  });

  const stateOf = () => page.evaluate(() => window.__POLYGON_SHOWDOWN__.showdown.game.state);
  for (let index = 0; index < MOVES; index += 1) {
    await page.waitForFunction(() => !window.__POLYGON_SHOWDOWN__.showdown.game.busy, null, { polling: 80 });
    const state = await stateOf();
    const [a, b] = allLegalMoves(decodeBoard(state.board), 8, 8)[0];
    await page.locator(`.cell[data-cell="${a}"]`).click();
    await page.locator(`.cell[data-cell="${b}"]`).click();
    await page.waitForFunction((count) => window.__POLYGON_SHOWDOWN__.showdown.game.state.moves > count && !window.__POLYGON_SHOWDOWN__.showdown.game.busy, state.moves, { polling: 80 });
  }
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__frameLoop);
    return window.__frames.slice(5);
  });
  const sorted = frames.slice().sort((x, y) => x - y);
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  const scripts = [...resources.entries()].filter(([path]) => path.endsWith(".js"));
  const gameScripts = scripts.filter(([path]) => path.includes("/internal-games/"));
  const threeLoaded = scripts.some(([path]) => /vendor\/three|avatar\/stage/.test(path));
  const totalKb = Math.round(gameScripts.reduce((sum, [, size]) => sum + size, 0) / 1024);
  const cssKb = Math.round([...resources.entries()].filter(([path]) => path.endsWith(".css")).reduce((sum, [, size]) => sum + size, 0) / 1024);
  const report = {
    cpuSlowdown: `${CPU_SLOWDOWN}x`,
    framesSampled: frames.length,
    meanFps: Math.round(1000 / (frames.reduce((sum, value) => sum + value, 0) / frames.length)),
    frameP95Ms: Math.round(percentile(0.95)),
    frameP99Ms: Math.round(percentile(0.99)),
    worstFrameMs: Math.round(sorted[sorted.length - 1]),
    gameplayScriptKb: totalKb,
    gameplayCssKb: cssKb,
    scriptFiles: gameScripts.length,
    threeJsLoaded: threeLoaded
  };
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  if (threeLoaded) process.exitCode = 1;
} finally {
  await browser.close();
  await admin.rpc("polygon_host_command", { p_owner_hash: owner, p_token_hash: hashToken("host", hostToken), p_command: "close", p_args: {} });
}
