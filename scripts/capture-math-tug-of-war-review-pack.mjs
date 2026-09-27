/**
 * Math Tug of War owner screenshot pack (local modes) from the shipped game
 * document under its production CSP (mobile gameplay harness). The Online
 * Match and Math Games card shots come from the two-client run
 * (TUG_REVIEW_PACK_DIR=... node scripts/run-math-tug-of-war-online-e2e.mjs -g "review pack").
 *
 *   node scripts/capture-math-tug-of-war-review-pack.mjs [outputDir]
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

import { startMobileGameplayHarness } from "./mobile-gameplay-harness.mjs";

const out = resolve(process.argv[2] ?? "owner-review/math-tug-of-war-v1");
mkdirSync(out, { recursive: true });
const MINUS = String.fromCharCode(0x2212);
const TIMES = String.fromCharCode(0xd7);

function solve(text) {
  const plain = text.split(MINUS).join("-").split(TIMES).join("*").trim();
  const opposite = /^What is the opposite of (-?\d+)\?$/.exec(plain);
  if (opposite) return Number(opposite[1]) === 0 ? 0 : -Number(opposite[1]);
  const absolute = /^\|(-?\d+)\|$/.exec(plain);
  if (absolute) return Math.abs(Number(absolute[1]));
  const binary = /^(-?\d+) ([+*-]) \(?(-?\d+)\)?$/.exec(plain);
  const a = Number(binary[1]);
  const b = Number(binary[3]);
  return binary[2] === "+" ? a + b : binary[2] === "-" ? a - b : a * b;
}

const server = await startMobileGameplayHarness(0);
const base = `http://127.0.0.1:${server.address().port}/games/math-tug-of-war/play`;
const browser = await chromium.launch();
const shots = [];

async function open(viewport, options = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...options });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole("heading", { level: 1 }).waitFor();
  return { context, page };
}
async function shot(page, name, locator) {
  const path = resolve(out, `${name}.png`);
  if (locator) await locator.screenshot({ path });
  else await page.screenshot({ path });
  shots.push(name);
}
async function start(page, mode, skill, names = { turquoise: "Sharks", pink: "Comets" }) {
  await page.click(`button[data-mode=${mode}]`);
  if (mode === "teams") {
    await page.fill("#team-1-name", names.turquoise);
    await page.fill("#team-2-name", names.pink);
  } else {
    await page.fill("#player-name", names.turquoise);
  }
  await page.check(`#skill-${skill}`);
  await page.click(".setup-form button[type=submit]");
  await page.locator(".team-panel").first().waitFor();
}
async function type(page, team, value, submit = true) {
  const panel = page.locator(`.team-panel.team-${team}`);
  await panel.locator(":scope:not([data-result])").waitFor();
  const keys = value < 0 ? ["-", ...String(-value)] : [...String(value)];
  for (const key of [...keys, ...(submit ? ["submit"] : [])]) await panel.locator(`.key[data-key="${key}"]`).click();
}
async function correct(page, team, submit = true) {
  const text = await page.locator(`.team-panel.team-${team} .question-text`).textContent();
  await type(page, team, solve(text), submit);
}
async function settle(page, ms = 1100) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.querySelectorAll(".has-keyboard").forEach(element => element.classList.remove("has-keyboard")));
  await page.waitForTimeout(ms);
}

try {
  // 2-4, 5-6 (forms): setup screens.
  {
    const { context, page } = await open({ width: 1366, height: 900 });
    await shot(page, "02-main-game-setup");
    await page.click("button[data-mode=robot]");
    await page.fill("#player-name", "Ava");
    await shot(page, "03-vs-robot-setup");
    await page.click("text=Back");
    await page.click("button[data-mode=teams]");
    await page.fill("#team-1-name", "Sharks");
    await page.fill("#team-2-name", "Comets");
    await page.check("#skill-integers");
    await shot(page, "04-two-teams-setup");
    await page.click("text=Back");
    await page.click("button[data-mode=online]");
    await page.click("button[data-online=create]");
    await page.fill("#online-name", "Ava");
    await page.check("#skill-integers");
    await shot(page, "05a-online-create-game-form");
    await page.click("text=Back");
    await page.click("button[data-online=join]");
    await page.fill("#online-name", "Bo");
    await page.fill("#room-code", "AB7K2");
    await shot(page, "06a-online-join-game-form");
    await context.close();
  }

  // 7-14: Smart Board 1920x1080 Two Teams.
  {
    const { context, page } = await open({ width: 1920, height: 1080 });
    await start(page, "teams", "integers");
    await settle(page, 300);
    await shot(page, "07-smart-board-gameplay");
    await shot(page, "10-centered-rope");
    await correct(page, "turquoise");
    await page.waitForTimeout(260);
    await shot(page, "08-turquoise-successful-pull");
    await settle(page, 900);
    await correct(page, "pink");
    await page.waitForTimeout(260);
    await shot(page, "09-pink-successful-pull");
    await settle(page, 900);
    for (let pull = 0; pull < 4; pull += 1) { await correct(page, "turquoise"); await page.waitForTimeout(700); }
    await settle(page);
    await shot(page, "11-near-turquoise-victory");
    await correct(page, "turquoise");
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(1200);
    await shot(page, "13-turquoise-victory");
    await page.getByRole("button", { name: "Play Again" }).click();
    for (let pull = 0; pull < 4; pull += 1) { await correct(page, "pink"); await page.waitForTimeout(700); }
    await settle(page);
    await shot(page, "12-near-pink-victory");
    await correct(page, "pink");
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(1200);
    await shot(page, "14-pink-victory");
    await context.close();
  }

  // 15-20: every skill, laptop/Smart Board landscape.
  const skills = [["15", "addition"], ["16", "subtraction"], ["17", "multiplication"], ["18", "integer-add-subtract", "integers"], ["19", "opposite"], ["20", "absolute-value", "absolute"]];
  for (const [number, name, id] of skills) {
    const { context, page } = await open({ width: 1366, height: 768 });
    await start(page, "teams", id ?? name);
    await correct(page, "pink");
    await settle(page);
    await shot(page, `${number}-${name}-gameplay`);
    await context.close();
  }

  // 21: signed-number keypad.
  {
    const { context, page } = await open({ width: 1366, height: 768 });
    await start(page, "teams", "integers");
    await type(page, "turquoise", -7, false);
    await settle(page, 200);
    await shot(page, "21-signed-number-keypad", page.locator(".team-panel.team-turquoise"));
    await context.close();
  }

  // 22: phone VS Robot.
  {
    const { context, page } = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
    await start(page, "robot", "multiplication", { turquoise: "Ava" });
    await correct(page, "turquoise");
    await settle(page, 1300);
    await shot(page, "22-phone-vs-robot");
    await context.close();
  }

  // 24: iPad Two Teams.
  {
    const { context, page } = await open({ width: 820, height: 1180 }, { hasTouch: true });
    await start(page, "teams", "opposite");
    await correct(page, "turquoise");
    await settle(page);
    await shot(page, "24-ipad-two-teams");
    await context.close();
  }

  // 25: reduced motion.
  {
    const { context, page } = await open({ width: 1366, height: 768 }, { reducedMotion: "reduce" });
    await start(page, "teams", "addition");
    await correct(page, "turquoise");
    await correct(page, "turquoise");
    await settle(page, 300);
    await shot(page, "25-reduced-motion");
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.stdout.write(`${shots.length} screenshots in ${out}\n${shots.join("\n")}\n`);
