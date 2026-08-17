import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { GAME_SUITE_THUMBNAIL_CONTENT as content } from "./game-suite-thumbnail-content.mjs";

const engineSource = await readFile(resolve("apps/platform-web/public/internal-games/number-cross/src/game-engine.js"));
const {
  calculatePlayerValues,
  calculateTargets,
  generatePuzzle,
  getLineStatus
} = await import(`data:text/javascript;base64,${engineSource.toString("base64")}`);

const origin = "http://127.0.0.1:3000";
const outputDirectory = resolve("apps/platform-web/public/media/games");
const cli = resolve("node_modules/supabase/dist/supabase.js");
const capturePassword = "LocalThumbnailCapture42!";
const captureEmail = `thumbnail-capture-${Date.now()}@example.test`;
const catalogReviewArgument = process.argv.find((argument) => argument.startsWith("--catalog-review="));
const catalogReviewPath = catalogReviewArgument ? resolve(catalogReviewArgument.slice("--catalog-review=".length)) : null;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertLocalUrl(value, label) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:", `${label} must use local HTTP.`);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), `${label} must remain local-only.`);
}

async function encodeThumbnail(key, source) {
  const image = sharp(source, { failOn: "warning", limitInputPixels: 4096 * 4096 })
    .resize({ width: 1200, height: 675, fit: "cover", position: "centre" });
  const webp = await image.clone().webp({ quality: 82, effort: 6, smartSubsample: true }).toBuffer();
  const avif = await image.clone().avif({ quality: 58, effort: 6, chromaSubsampling: "4:2:0" }).toBuffer();
  assert.ok(webp.byteLength < 120_000, `${key}.webp exceeds the catalog budget.`);
  assert.ok(avif.byteLength < 120_000, `${key}.avif exceeds the catalog budget.`);
  await writeFile(resolve(outputDirectory, `${key}.webp`), webp);
  await writeFile(resolve(outputDirectory, `${key}.avif`), avif);
  return {
    webp: { bytes: webp.byteLength, sha256: sha256(webp) },
    avif: { bytes: avif.byteLength, sha256: sha256(avif) }
  };
}

async function signIn(page, email) {
  await page.goto(`${origin}/sign-in?next=%2Fgames`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(capturePassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${origin}/games`);
}

async function captureCatalogReview(page, path) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/games`, { waitUntil: "domcontentloaded" });
  const cards = page.locator(".game-card-grid article");
  await cards.first().waitFor();
  assert.equal(await cards.count(), 4, "Owner-review catalog must contain exactly four game cards.");
  for (const title of ["Math Vocabulary Hunt", "Number Logic", "Number Cross", "CrossCalc"]) {
    assert.equal(await page.getByRole("heading", { name: title, exact: true }).count(), 1, `Owner-review catalog card: ${title}`);
  }
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.screenshot({ animations: "disabled", fullPage: true, path, type: "png" });
}

async function readyForCapture(page, width, extraCss = "") {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.addStyleTag({ content: `
    html, body { width: ${width}px !important; min-width: ${width}px !important; overflow: hidden !important; }
    .native-back-link, .native-music-credit { display: none !important; }
    * { caret-color: transparent !important; }
    ${extraCss}
  ` });
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

async function captureNumberLogic(page) {
  const fixture = content.numberLogic;
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${origin}${fixture.route}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Number Logic", exact: true }).waitFor();
  await page.getByRole("button", { name: /Lines of 3/i }).click();
  const skip = page.getByRole("button", { name: /Skip tutorial/i });
  if (await skip.count()) await skip.click();
  await page.getByRole("button", { name: /Play Beginner/i }).click();
  const game = page.locator("main[data-puzzle-id]");
  await game.waitFor();
  assert.equal(await game.getAttribute("data-puzzle-id"), fixture.puzzleId);

  const observedMoves = [];
  for (const expectedMove of fixture.solverBackedMoves) {
    for (let level = 1; level <= 4; level += 1) {
      await page.getByRole("button", { name: new RegExp(`^Show hint ${level}$`, "i") }).click();
    }
    const hintPanel = page.locator("section").filter({ hasText: "Proof-backed hints" });
    const hintText = await hintPanel.innerText();
    const match = hintText.match(/Place (\d+) at (T|ML|MC|MR|BL|BC|BR)\./);
    assert.ok(match, `Number Logic did not expose a solver-backed move: ${hintText}`);
    const observed = { value: Number(match[1]), position: match[2], message: match[0] };
    assert.deepEqual(observed, expectedMove);
    observedMoves.push(observed);
    await page.getByRole("button", { name: new RegExp(`^Number ${observed.value}, in tray$`) }).click();
    await page.locator(`[data-position-id="${observed.position}"]`).click();
    await page.locator('[data-feasibility="PROVEN_POSSIBLE"]').waitFor();
    assert.equal(await page.locator('[data-state="conflict"], [data-line-state="IMPOSSIBLE"]').count(), 0);
    assert.equal(await page.getByRole("button", { name: new RegExp(`^Number ${observed.value}, in tray$`) }).count(), 0);
  }

  const visibleRoutes = await page.locator("[data-line-state]").evaluateAll((items) => items.map((item) => ({
    name: item.querySelector("span")?.textContent?.trim() ?? "",
    expression: item.querySelector("strong")?.textContent?.trim() ?? "",
    state: item.getAttribute("data-line-state") ?? ""
  })));
  assert.deepEqual(visibleRoutes, fixture.visibleRoutes);
  assert.deepEqual(observedMoves, fixture.solverBackedMoves);
  assert.equal(await page.locator("[data-testid=lines-completion]").count(), 0);
  assert.equal((await page.locator('[data-feasibility="PROVEN_POSSIBLE"]').textContent())?.trim(), "Completion possible");
  await readyForCapture(page, 1600, `
    [data-audio-manager-count] > header,
    [data-audio-manager-count] > aside[aria-label="Classroom presentation controls"],
    [data-audio-manager-count] > footer { display: none !important; }
    main[data-puzzle-id] { padding-top: .75rem !important; }
  `);
  await game.locator(":scope > header strong").last().evaluate((element) => { element.textContent = "0:00"; });
  const screenshot = await page.screenshot({ animations: "disabled", type: "png" });
  return encodeThumbnail("number-logic", screenshot);
}

async function captureNumberCross(page) {
  const fixture = content.numberCross;
  const puzzle = generatePuzzle({ mode: fixture.mode, difficulty: fixture.difficulty, seed: fixture.seed });
  assert.equal(puzzle.id, fixture.puzzleId);
  assert.deepEqual(puzzle.grid, fixture.grid);
  assert.deepEqual(puzzle.rowTargets, fixture.rowTargets);
  assert.deepEqual(puzzle.columnTargets, fixture.columnTargets);
  assert.deepEqual(puzzle.solution, fixture.solution);
  assert.equal(puzzle.metadata.count, fixture.uniqueSolutionCount);
  assert.deepEqual(calculateTargets(puzzle.grid, puzzle.solution, puzzle.mode), {
    rows: fixture.rowTargets,
    columns: fixture.columnTargets
  });

  await page.goto(`${origin}/games`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("mathnexa:number-cross:tutorial-complete", "true"));
  await page.goto(`${origin}${fixture.route}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Every line has an answer/i }).waitFor();
  await page.getByRole("button", { name: /^Addition/ }).click();
  await page.getByRole("button", { name: /^Easy/ }).click();
  await page.getByRole("button", { name: "Start Addition" }).click();
  const grid = page.getByRole("grid", { name: "4 by 4 Number Cross board" });
  await grid.waitFor();

  const cellValues = await page.getByRole("gridcell").evaluateAll((items) => items.map((item) => {
    const value = item.getAttribute("aria-label")?.match(/value (\d+)/)?.[1];
    return Number(value);
  }));
  assert.deepEqual(cellValues, fixture.grid.flat());
  for (const index of fixture.captureCrossedIndices) await page.getByRole("gridcell").nth(index).click();
  const crossed = await page.getByRole("gridcell").evaluateAll((items) => items.flatMap((item, index) => item.getAttribute("aria-pressed") === "true" ? [index] : []));
  assert.deepEqual(crossed, fixture.captureCrossedIndices);

  const playerValues = calculatePlayerValues(puzzle.grid, new Set(crossed), puzzle.mode);
  assert.deepEqual(playerValues.rows, fixture.capturePlayerRows);
  assert.deepEqual(playerValues.columns, fixture.capturePlayerColumns);
  const statuses = [
    ...playerValues.rows.map((value, index) => getLineStatus(value, puzzle.rowTargets[index], puzzle.mode)),
    ...playerValues.columns.map((value, index) => getLineStatus(value, puzzle.columnTargets[index], puzzle.mode))
  ];
  assert.equal(statuses.filter((state) => state === "correct").length, fixture.captureCorrectLineCount);
  assert.equal(statuses.filter((state) => state === "impossible").length, 0);
  assert.equal(await page.locator(".target-badge.impossible").count(), 0);
  assert.equal(await page.getByRole("heading", { name: "Puzzle complete!" }).count(), 0);
  const logicToast = page.locator(".logic-toast");
  if (await logicToast.count()) await logicToast.waitFor({ state: "detached" });
  await page.setViewportSize({ width: 1200, height: 675 });
  await readyForCapture(page, 1200);
  await page.locator("#timer-live").evaluate((element) => { element.textContent = "00:00"; });
  const screenshot = await page.screenshot({ animations: "disabled", type: "png" });
  return encodeThumbnail("number-cross", screenshot);
}

assertLocalUrl(origin, "Capture origin");
const response = await fetch(`${origin}/games`, { redirect: "manual" });
assert.ok(response.status < 500, "Start the local owner-review server before capturing thumbnails.");
console.log("Capture preflight: local review origin is reachable.");

const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"]
}));
assertLocalUrl(status.API_URL, "Supabase API");
assert.equal(status.API_URL, "http://127.0.0.1:55321", "Thumbnail capture requires the repository's local Supabase stack.");
for (const key of ["PUBLISHABLE_KEY", "SECRET_KEY"]) assert.ok(typeof status[key] === "string" && status[key].length > 10, `Local Supabase ${key} is unavailable.`);

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const publication = await admin.from("game_catalog_entries").select("stable_key,status").in("stable_key", ["number-logic", "number-cross"]);
if (publication.error) throw publication.error;
assert.deepEqual(new Map(publication.data.map((entry) => [entry.stable_key, entry.status])), new Map([
  ["number-cross", "published"],
  ["number-logic", "published"]
]));
console.log("Capture preflight: local catalog entries are published.");

const created = await admin.auth.admin.createUser({ email: captureEmail, password: capturePassword, email_confirm: true });
if (created.error || !created.data.user) throw created.error ?? new Error("Local thumbnail subscriber could not be created.");
const captureUserId = created.data.user.id;
let browser;
let cleanupError = null;
try {
  const startsAt = new Date();
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", captureUserId);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: captureUserId,
    entitlement_state: "trial-active",
    trial_started_at: startsAt.toISOString(),
    trial_ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString()
  });
  if (entitlement.error) throw entitlement.error;

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const remoteRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) remoteRequests.push(url.origin);
  });
  await page.addInitScript(({ numberLogicRoute, numberLogicEpoch, numberCrossRoute, numberCrossEpoch, numberCrossRandom }) => {
    if (location.pathname === numberLogicRoute) Date.now = () => numberLogicEpoch;
    if (location.pathname === numberCrossRoute) {
      Date.now = () => numberCrossEpoch;
      Math.random = () => numberCrossRandom;
    }
  }, {
    numberLogicRoute: content.numberLogic.route,
    numberLogicEpoch: content.numberLogic.fixedEpochMs,
    numberCrossRoute: content.numberCross.route,
    numberCrossEpoch: content.numberCross.fixedEpochMs,
    numberCrossRandom: content.numberCross.fixedRandom
  });

  await signIn(page, captureEmail);
  console.log("Capture preflight: temporary local subscriber is entitled.");
  if (catalogReviewPath) {
    await captureCatalogReview(page, catalogReviewPath);
    console.log(`Catalog review evidence: ${catalogReviewPath}`);
  }
  const numberLogic = await captureNumberLogic(page);
  console.log("Capture validated: Number Logic uses the deterministic solver-backed state.");
  const numberCross = await captureNumberCross(page);
  console.log("Capture validated: Number Cross uses the deterministic production engine state.");
  assert.deepEqual(remoteRequests, [], `Capture attempted remote requests: ${remoteRequests.join(", ")}`);
  console.log(JSON.stringify({ numberLogic, numberCross }, null, 2));
} finally {
  await browser?.close();
  const deleted = await admin.auth.admin.deleteUser(captureUserId);
  cleanupError = deleted.error;
}
if (cleanupError) throw cleanupError;

// Re-read outputs so a failed or partial write cannot be mistaken for a complete capture.
for (const key of ["number-logic", "number-cross"]) {
  for (const format of ["webp", "avif"]) {
    const path = resolve(outputDirectory, `${key}.${format}`);
    const image = await readFile(path);
    const metadata = await sharp(image).metadata();
    assert.deepEqual([metadata.width, metadata.height], [1200, 675], path);
  }
}

console.log("Authentic Number Logic and Number Cross thumbnail capture passed without remote runtime dependencies.");
