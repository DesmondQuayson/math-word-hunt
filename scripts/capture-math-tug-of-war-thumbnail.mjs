/**
 * Captures the Math Tug of War Math Games card artwork from the shipped game
 * (production document + CSP via the mobile gameplay harness): a real Two
 * Teams match, Turquoise vs Pink, mid-tug. Writes
 * apps/platform-web/public/media/games/math-tug-of-war.{webp,avif} at the
 * catalog size (1200x675) and prints the byte/sha256 manifest for
 * scripts/game-suite-thumbnail-content.mjs.
 *
 *   node scripts/capture-math-tug-of-war-thumbnail.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import sharp from "sharp";

import { startMobileGameplayHarness } from "./mobile-gameplay-harness.mjs";

const MINUS = String.fromCharCode(0x2212);
const TIMES = String.fromCharCode(0xd7);
const outputDirectory = resolve("apps/platform-web/public/media/games");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function solve(text) {
  const plain = text.split(MINUS).join("-").split(TIMES).join("*");
  const binary = /^(-?\d+) ([+*-]) \(?(-?\d+)\)?$/.exec(plain);
  assert.ok(binary, `unexpected question ${text}`);
  const a = Number(binary[1]);
  const b = Number(binary[3]);
  return binary[2] === "+" ? a + b : binary[2] === "-" ? a - b : a * b;
}

const server = await startMobileGameplayHarness(0);
const { port } = server.address();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await page.goto(`http://127.0.0.1:${port}/games/math-tug-of-war/play`);
  await page.click("button[data-mode=teams]");
  await page.fill("#team-1-name", "Turquoise");
  await page.fill("#team-2-name", "Pink");
  await page.check("#skill-integers");
  await page.click(".setup-form button[type=submit]");
  const answer = async team => {
    const panel = page.locator(`.team-panel.team-${team}`);
    await panel.locator(":scope:not([data-result])").waitFor();
    const value = solve((await panel.locator(".question-text").textContent()).trim());
    const keys = value < 0 ? ["-", ...String(-value)] : [...String(value)];
    for (const key of [...keys, "submit"]) await panel.locator(`.key[data-key="${key}"]`).click();
    await page.waitForTimeout(600);
  };
  await answer("pink");
  await answer("turquoise");
  await answer("turquoise");
  // Pink has typed its (correct) signed answer and is about to submit.
  const pink = page.locator(".team-panel.team-pink");
  await pink.locator(":scope:not([data-result])").waitFor();
  const pinkValue = solve((await pink.locator(".question-text").textContent()).trim());
  for (const key of pinkValue < 0 ? ["-", ...String(-pinkValue)] : [...String(pinkValue)]) await pink.locator(`.key[data-key="${key}"]`).click();
  await page.mouse.move(0, 0);
  // The desktop-only keyboard-owner chip is incidental; keep the card clean.
  await page.evaluate(() => document.querySelectorAll(".has-keyboard").forEach(element => element.classList.remove("has-keyboard")));
  await page.waitForTimeout(900);
  assert.equal(await page.locator(".tug-scene-svg").getAttribute("data-position"), "-1");
  const source = await page.screenshot({ type: "png" });
  const image = sharp(source).resize({ width: 1200, height: 675, fit: "cover", position: "centre" });
  const webp = await image.clone().webp({ quality: 82, effort: 6, smartSubsample: true }).toBuffer();
  const avif = await image.clone().avif({ quality: 58, effort: 6, chromaSubsampling: "4:2:0" }).toBuffer();
  assert.ok(webp.byteLength < 120_000, "webp exceeds the catalog budget");
  assert.ok(avif.byteLength < 120_000, "avif exceeds the catalog budget");
  await writeFile(resolve(outputDirectory, "math-tug-of-war.webp"), webp);
  await writeFile(resolve(outputDirectory, "math-tug-of-war.avif"), avif);
  process.stdout.write(`${JSON.stringify({
    webp: { bytes: webp.byteLength, sha256: sha256(webp) },
    avif: { bytes: avif.byteLength, sha256: sha256(avif) }
  }, null, 2)}\n`);
} finally {
  await browser.close();
  server.close();
}
