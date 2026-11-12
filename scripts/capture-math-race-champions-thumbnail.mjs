/**
 * Captures the Math Race Champions catalog artwork from a REAL race on the
 * running local app: a free account starts Stage 1 against the computer, answers
 * correctly until the car is at speed, and the shot is taken of the 3D road with
 * the question, the speedometer and the minimap exactly as a player sees them.
 * Writes apps/platform-web/public/media/games/math-race-champions.{webp,avif}
 * (1200x675) and qa-artifacts/math-race-champions/thumbnail-audit.json.
 *
 *   node scripts/run-math-race-champions.mjs thumbnail
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

import { solveQuestion } from "./math-race-champions-racer.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = process.env.MATH_RACE_CHAMPIONS_URL ?? "http://127.0.0.1:3103";
const account = JSON.parse(process.env.RACE_ACCOUNTS ?? "{}").owner;
assert.ok(account?.password, "RACE_ACCOUNTS is required");
const PLAY = "/games/math-race-champions/play";

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1200, height: 675 } });
  const page = await context.newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent(PLAY)}`);
  await page.getByLabel("Email address").fill(account.email);
  await page.locator('input[name="password"]').first().fill(account.password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname === PLAY, { timeout: 120_000 });
  await page.waitForFunction(() => document.body.dataset.screen === "hub", null, { timeout: 60_000 });
  await page.getByRole("button", { name: /Race Computer/ }).click();
  await page.waitForFunction(() => document.body.dataset.screen === "computer");
  await page.getByRole("button", { name: "Start race" }).click();
  await page.waitForFunction(() => document.querySelector("main.race")?.getAttribute("data-phase") === "racing" && !document.querySelector(".race-choice")?.disabled, null, { timeout: 180_000 });

  // Real answers, worked out from the question on screen. After fourteen the
  // car is at speed; the race is then played on until the question on screen is
  // a short equation, which stays readable when the picture is shown small on a
  // card. Nothing is staged: it is whichever equation the race asks next.
  const shownQuestion = () => page.evaluate(() => ({ text: document.querySelector(".race-question").textContent, choices: [...document.querySelectorAll(".race-choice-label")].map((node) => node.textContent) }));
  for (let index = 0; index < 26; index += 1) {
    const question = await shownQuestion();
    if (index >= 14 && /^\d+ [^ ] \? = \d+$/.test(question.text)) break;
    await page.locator(`.race-choice[data-choice="${solveQuestion(question.text, question.choices)}"]`).click();
    await page.waitForFunction((previous) => !document.querySelector(".race-choice")?.disabled && document.querySelector(".race-question").textContent !== previous, question.text, { timeout: 20_000 }).catch(() => {});
  }
  await page.waitForTimeout(400);

  const audit = await page.evaluate(() => {
    const view = window.__MATH_RACE__.race.view();
    return {
      graphics: window.__MATH_RACE__.race.graphics(),
      speed: Math.round(view.speed),
      correct: view.correct,
      progress: Number(view.progress.toFixed(3)),
      question: document.querySelector(".race-question").textContent,
      choices: [...document.querySelectorAll(".race-choice-label")].map((node) => node.textContent)
    };
  });
  assert.ok(["low", "medium", "high"].includes(audit.graphics), "the 3D scene is not drawing");
  assert.ok(audit.correct >= 12 && audit.speed >= 60, "the car is not at speed");
  assert.equal(audit.choices.length, 2);
  // The artwork never shows a conversion in the old bare form ("10% = ?").
  assert.ok(!/^\d+(\.\d+)?%? = \?$/.test(audit.question) || /[⁰¹²³]/.test(audit.question), `unexpected question on the artwork: ${audit.question}`);

  const shot = await page.screenshot({ type: "png" });
  mkdirSync("qa-artifacts/math-race-champions", { recursive: true });
  const directory = resolve("apps/platform-web/public/media/games");
  const webp = await sharp(shot).resize(1200, 675).webp({ quality: 84 }).toBuffer();
  const avif = await sharp(shot).resize(1200, 675).avif({ quality: 58 }).toBuffer();
  writeFileSync(resolve(directory, "math-race-champions.webp"), webp);
  writeFileSync(resolve(directory, "math-race-champions.avif"), avif);
  writeFileSync("qa-artifacts/math-race-champions/thumbnail-audit.json", JSON.stringify({
    capturedFrom: "a real Stage 1 race against the computer on the local owner review",
    ...audit,
    sha256: { webp: createHash("sha256").update(webp).digest("hex"), avif: createHash("sha256").update(avif).digest("hex") }
  }, null, 2));
  console.log(`Thumbnail captured: ${audit.correct} correct answers, ${audit.speed} km/h, ${audit.graphics} graphics.`);
  // Leave the race tidily.
  await page.evaluate(async () => { await window.__MATH_RACE__.race.driver.quit(); });
  await context.close();
} finally {
  await browser.close();
}
