/**
 * Math Race Champions — Classroom Competition on an older panel browser.
 *
 * Opens the classroom board on the running local review server twice at each
 * size: once as a current browser sees it, once with the stylesheet served the
 * way an older Chromium parses it (scripts/math-race-champions-legacy-css.mjs),
 * and measures what is on screen: both tracks, the 62 numbers, the football,
 * the counters, the question and the two answer buttons.
 *
 *   node scripts/math-race-champions-board-repro.mjs [--out dir] [--sizes 1920x1080,1366x768] [--modes current,legacy,starved]
 *
 * Modes: "current" (this browser), "legacy" (older Chromium parsing), "starved"
 * (older parsing AND the board's height rule removed altogether, standing in
 * for a browser nobody has tested: the game's own check must still give both
 * tracks room). Exits 1 if any run does not show both complete tracks, the
 * footballs, the counters, the questions and all four answer buttons.
 *
 * Needs MATH_RACE_CHAMPIONS_URL and RACE_ACCOUNTS (the e2e runner sets them).
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { droppedDeclarations, legacyCss } from "./math-race-champions-legacy-css.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = process.env.MATH_RACE_CHAMPIONS_URL ?? "http://127.0.0.1:3103";
const account = JSON.parse(process.env.RACE_ACCOUNTS ?? "{}").owner;
assert.ok(account?.password, "RACE_ACCOUNTS is required");
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const OUT = resolve(argument("out", "qa-artifacts/math-race-champions/board"));
const SIZES = argument("sizes", "1366x768,1600x900,1920x1080,1920x1200,2560x1440,1920x940,1366x640,1024x768,768x1024,430x932,390x844,360x740,320x568").split(",").map((size) => size.split("x").map(Number));
const MODES = argument("modes", "current,legacy,starved").split(",");
let failures = 0;
mkdirSync(OUT, { recursive: true });
const PLAY = "/games/math-race-champions/play";

const browser = await chromium.launch();
const report = { at: new Date().toISOString(), dropped: null, runs: [] };
try {
  for (const mode of MODES) {
    const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 } });
    if (mode !== "current") {
      await context.route(/\/internal-games\/math-race-champions\/styles\.css/, async (route) => {
        const response = await route.fetch();
        const text = await response.text();
        report.dropped ??= droppedDeclarations(text);
        let body = legacyCss(text);
        // "starved": no height rule for the board at all.
        if (mode === "starved") body = body.replace(/(\.classroom\s*\{[^}]*?)height: 100vh;\s*height: var\(--app-h, 100vh\);/, "$1");
        await route.fulfill({ response, body });
      });
    }
    const page = await context.newPage();
    await page.goto(`/sign-in?next=${encodeURIComponent(PLAY)}`);
    await page.getByLabel("Email address").fill(account.email);
    await page.locator('input[name="password"]').first().fill(account.password);
    await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
    await page.waitForURL((url) => url.pathname === PLAY, { timeout: 120_000 });
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto(PLAY);
      await page.waitForFunction(() => document.body.dataset.screen === "hub", null, { timeout: 60_000 });
      await page.getByRole("button", { name: /Classroom Competition/ }).click();
      await page.waitForFunction(() => document.body.dataset.screen === "classroom-setup");
      await page.getByRole("button", { name: "Continue to the board" }).click();
      await page.waitForFunction(() => document.body.dataset.screen === "classroom");
      await page.getByRole("button", { name: "Start the race" }).click();
      await page.waitForFunction(() => document.querySelector(".classroom")?.getAttribute("data-phase") === "playing", null, { timeout: 15_000 });
      await page.waitForTimeout(600);
      const seen = await page.evaluate(() => {
        const box = (node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
        const inView = (r) => r.w > 0 && r.h > 0 && r.x >= -1 && r.y >= -1 && r.x + r.w <= window.innerWidth + 1 && r.y + r.h <= window.innerHeight + 1;
        return {
          viewport: [window.innerWidth, window.innerHeight],
          layout: document.querySelector(".classroom").dataset.layout,
          classroom: box(document.querySelector(".classroom")),
          scroll: [document.documentElement.scrollWidth - window.innerWidth, document.documentElement.scrollHeight - window.innerHeight],
          teams: [...document.querySelectorAll(".cr-team")].map((team) => {
            const track = team.querySelector(".cr-track");
            const tiles = [...team.querySelectorAll(".tile")];
            const numbers = tiles.map((tile) => tile.querySelector(".tile-label")?.textContent ?? "");
            const tileBoxes = tiles.map((tile) => box(tile));
            return {
              team: team.dataset.team,
              track: box(track),
              tiles: tiles.length,
              numbersInOrder: numbers.slice(1, -1).every((label, index) => label === String(index + 1)) && numbers.length === 64,
              tilesInView: tileBoxes.filter(inView).length,
              tileSize: tileBoxes.length ? Math.round(Math.min(...tileBoxes.map((tile) => tile.w))) : 0,
              ball: team.querySelector(".ball") ? box(team.querySelector(".ball")) : null,
              count: team.querySelector(".cr-count")?.textContent,
              left: team.querySelector(".cr-left")?.textContent,
              question: box(team.querySelector(".cr-question")),
              choices: [...team.querySelectorAll(".cr-choice")].map((button) => box(button))
            };
          })
        };
      });
      await page.screenshot({ path: `${OUT}/classroom-${mode}-${width}x${height}.png` });
      report.runs.push({ mode, size: `${width}x${height}`, ...seen });
      const inside = (box) => box.w > 0 && box.h > 0 && box.x >= -1 && box.y >= -1 && box.x + box.w <= width + 1 && box.y + box.h <= height + 1;
      const good = seen.teams.length === 2 && seen.scroll[0] <= 1 && seen.scroll[1] <= 1 && seen.teams.every((team) => team.tiles === 64 && team.tilesInView === 64 && team.numbersInOrder && team.ball && inside(team.ball) && inside(team.question) && team.choices.length === 2 && team.choices.every(inside) && team.count === "0 / 62" && team.left === "62 STEPS LEFT");
      if (!good) failures += 1;
      const line = seen.teams.map((team) => `${team.team} track ${team.track.w}x${team.track.h} tile ${team.tileSize}px ${team.tilesInView}/64 answers ${team.choices.map((choice) => `${choice.w}x${choice.h}`).join(",")}`).join(" | ");
      console.log(`${good ? "PASS" : "FAIL"} ${mode.padEnd(7)} ${`${width}x${height}`.padEnd(9)} layout=${seen.layout} ${line}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/board-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${report.runs.length - failures}/${report.runs.length} board layouts show both complete tracks${failures ? `; ${failures} FAILED` : ""}`);
console.log(`Declarations an older Chromium drops: ${report.dropped?.length ?? 0}`);
for (const item of (report.dropped ?? []).slice(0, 30)) console.log(`  ${item.selector} { ${item.declaration} }`);
process.exitCode = failures ? 1 : 0;
