/**
 * Math Race Champions — art review sheet. Against a running local review
 * server, photographs every car in the garage from three angles and a race in
 * each of the five sceneries, so the 3D art can be judged as a set.
 *
 *   node scripts/math-race-champions-art-review.mjs [garage|race|all] [--out dir]
 *
 * Needs MATH_RACE_CHAMPIONS_URL and RACE_ACCOUNTS (the review runner sets them).
 * Pictures go to qa-artifacts/math-race-champions/art/ (not committed).
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { solveQuestion } from "./math-race-champions-racer.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = process.env.MATH_RACE_CHAMPIONS_URL ?? "http://127.0.0.1:3103";
const account = JSON.parse(process.env.RACE_ACCOUNTS ?? "{}").owner;
assert.ok(account?.password, "RACE_ACCOUNTS is required");
const what = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "all";
const outIndex = process.argv.indexOf("--out");
const OUT = resolve(outIndex >= 0 ? process.argv[outIndex + 1] : "qa-artifacts/math-race-champions/art");
mkdirSync(OUT, { recursive: true });
const PLAY = "/games/math-race-champions/play";
const CARS = ["starter", "turbo-sprint", "velocity-gt", "thunder-x"];
const VIEWS = [["front-34", 0.75, 0.24], ["side", Math.PI / 2, 0.12], ["rear-34", Math.PI - 0.7, 0.26]];
const STAGES = [[1, "starter"], [3, "turbo-sprint"], [5, "velocity-gt"], [7, "thunder-x"], [9, "thunder-x"]];

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  page.on("pageerror", error => console.error("page error:", error.message));
  await page.goto(`/sign-in?next=${encodeURIComponent(PLAY)}`);
  await page.getByLabel("Email address").fill(account.email);
  await page.locator('input[name="password"]').first().fill(account.password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL(url => url.pathname === PLAY, { timeout: 120_000 });
  await page.waitForFunction(() => document.body.dataset.screen === "hub", null, { timeout: 60_000 });
  const go = (name, params = {}) => page.evaluate(([screen, options]) => window.__MATH_RACE__.context.navigate(screen, options), [name, params]);

  if (what === "garage" || what === "all") {
    await go("garage");
    await page.waitForFunction(() => document.body.dataset.screen === "garage" && window.__MATH_RACE__.showroom && document.querySelector(".showroom-canvas")?.dataset.model, null, { timeout: 90_000 });
    for (const car of CARS) {
      await page.locator(`.car-tab[data-car="${car}"]`).click();
      await page.waitForFunction(key => document.querySelector(".showroom-canvas")?.dataset.model === key, car);
      for (const [name, azimuth, elevation] of VIEWS) {
        await page.evaluate(([a, e]) => window.__MATH_RACE__.showroom.look(a, e, 1), [azimuth, elevation]);
        await page.waitForTimeout(350);
        await page.locator(".showroom-canvas").screenshot({ path: `${OUT}/car-${car}-${name}.png` });
      }
    }
    console.log("garage: 12 pictures");
  }

  if (what === "race" || what === "all") {
    for (const [stage, car] of STAGES) {
      await go("hub");
      await page.waitForFunction(() => document.body.dataset.screen === "hub");
      // A test drive: the real race screen, in the tab, on that stage's road.
      await page.evaluate(async ([number, carKey]) => {
        const { startStage } = await import("/internal-games/math-race-champions/src/computer/start.js");
        await startStage(window.__MATH_RACE__.context, { stage: number, carKey, reason: "try", settings: { categories: ["missing-addend", "missing-multiplier", "powers"], difficulty: "beginner" } });
      }, [stage, car]);
      await page.waitForFunction(() => document.querySelector("main.race")?.getAttribute("data-phase") === "racing" && !document.querySelector(".race-choice")?.disabled, null, { timeout: 180_000 });
      for (let index = 0; index < 16; index += 1) {
        const question = await page.evaluate(() => ({ text: document.querySelector(".race-question").textContent, choices: [...document.querySelectorAll(".race-choice-label")].map(node => node.textContent) }));
        await page.locator(`.race-choice[data-choice="${solveQuestion(question.text, question.choices)}"]`).click();
        await page.waitForFunction(previous => !document.querySelector(".race-choice")?.disabled && document.querySelector(".race-question").textContent !== previous, question.text, { timeout: 20_000 }).catch(() => {});
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/race-stage-${stage}.png` });
      await page.evaluate(() => window.__MATH_RACE__.race.driver.quit());
    }
    console.log("race: 5 pictures");
  }
  await context.close();
} finally {
  await browser.close();
}
