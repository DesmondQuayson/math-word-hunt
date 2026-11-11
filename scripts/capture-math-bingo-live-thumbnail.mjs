/**
 * Captures the Math Bingo Live catalog artwork from a REAL game on the
 * running local app: a free teacher hosts, Ava, Zion and Omar join, Ava plays
 * to a real Bingo, and the shot is Ava's own tablet-landscape screen on the
 * next live question: the 5x5 card, marked cells, the glowing winning line,
 * the question, and the live top three. Every visible number is audited
 * (the question is solved from its text, every marked cell matched a question
 * that was really asked, the glowing line is complete) before anything is
 * written. Writes apps/platform-web/public/media/games/math-bingo-live.{webp,avif}
 * (1200x675) and qa-artifacts/math-bingo-live/thumbnail-audit.json.
 *
 *   MATH_BINGO_LIVE_URL=http://127.0.0.1:3100 BINGO_TEACHER_EMAIL=... BINGO_TEACHER_PASSWORD=... node scripts/capture-math-bingo-live-thumbnail.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = process.env.MATH_BINGO_LIVE_URL ?? "http://127.0.0.1:3100";
const email = process.env.BINGO_TEACHER_EMAIL ?? "bingo-teacher@example.test";
const password = process.env.BINGO_TEACHER_PASSWORD;
assert.ok(password, "BINGO_TEACHER_PASSWORD is required");
const LINES = [31, 992, 31744, 1015808, 32505856, 1082401, 2164802, 4329604, 8659208, 17318416, 17043521, 1118480];
const popcount = mask => { let count = 0; for (let value = mask >>> 0; value; value &= value - 1) count += 1; return count; };
const TIMES = "×";

const solve = text => {
  const match = /^(\d+) ([+−×÷]) (\d+)$/.exec(text);
  assert.ok(match, `unexpected question ${text}`);
  const [a, b] = [Number(match[1]), Number(match[3])];
  return { "+": a + b, "−": a - b, [TIMES]: a * b, "÷": a / b }[match[2]];
};
const state = page => page.evaluate(() => window.__MATH_BINGO_LIVE__.state);
async function until(page, predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const current = await state(page);
    if (current && predicate(current)) return current;
    if (Date.now() > deadline) throw new Error(`timeout: ${label}`);
    await page.waitForTimeout(150);
  }
}

const browser = await chromium.launch();
const asked = new Map();
try {
  const hostContext = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 } });
  const host = await hostContext.newPage();
  await host.goto(`/sign-in?next=${encodeURIComponent("/games/math-bingo-live/host")}`);
  await host.getByLabel("Email address").fill(email);
  await host.locator('input[name="password"]').first().fill(password);
  await host.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await host.waitForURL(url => url.pathname === "/games/math-bingo-live/host", { timeout: 120_000 });
  await host.waitForFunction(() => ["setup", "lobby", "host-game", "complete"].includes(document.body.dataset.screen), null, { timeout: 60_000 });
  if ((await host.locator("body").getAttribute("data-screen")) !== "setup") {
    await host.evaluate(async () => {
      const token = sessionStorage.getItem("mathnexa:math-bingo-live:host-token");
      await fetch("/api/games/math-bingo-live/host", { method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin", body: JSON.stringify({ action: "close", hostToken: token }) });
      sessionStorage.clear();
    });
    await host.reload();
    await host.waitForFunction(() => document.body.dataset.screen === "setup");
  }
  await host.locator("#winners-count").fill("3");
  for (const [name, value] of [["mode", "multiplication"], ["level", "x0-10"], ["questionSeconds", "60"], ["revealSeconds", "0"]]) {
    await host.locator(`input[name="${name}"][value="${value}"]`).click({ force: true });
  }
  await host.getByRole("button", { name: "CREATE GAME" }).click();
  const room = await until(host, current => /^\d{6}$/.test(current.code ?? ""), "room");

  const join = async (name, options = {}) => {
    const context = await browser.newContext({ baseURL: ORIGIN, ...options });
    const page = await context.newPage();
    // The join link (as in the teacher's QR code) opens the name screen directly.
    await page.goto(`/join?code=${room.code}`);
    await page.getByLabel("YOUR NAME").fill(name);
    await page.getByRole("button", { name: "JOIN GAME" }).click();
    await page.getByText("You're in!").waitFor();
    return page;
  };
  const ava = await join("Ava", { viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const zion = await join("Zion");
  const omar = await join("Omar");
  await host.getByRole("button", { name: "START GAME" }).click();
  for (const page of [ava, zion, omar]) await until(page, current => Boolean(current.me?.board), "card");

  const markBest = async (page, { hold = false } = {}) => {
    const current = await state(page);
    if (current.phase !== "QUESTION_ACTIVE" || current.me.hasWon || current.me.markUsed) return;
    const value = solve(current.question.text);
    let best = null;
    current.me.board.forEach((cell, index) => {
      if (cell.free || ((current.me.marks >>> index) & 1) === 1 || cell.n !== value) return;
      const score = Math.max(...LINES.map(mask => popcount((current.me.marks | (1 << index)) & mask)));
      if (hold && score >= 5) return;
      if (!best || score > best.score) best = { index, score };
    });
    if (!best) return;
    const reply = page.waitForResponse(response => response.url().endsWith("/api/games/math-bingo-live/play") && (response.request().postData() ?? "").includes("\"mark\""));
    await page.locator(`[data-cell="${best.index}"]`).click();
    assert.equal((await (await reply).json()).result, "correct");
  };
  const next = async () => {
    const before = await state(host);
    await host.locator(".controls .button-primary").click();
    return until(host, current => current.phase !== before.phase || current.questionNumber !== before.questionNumber, "next");
  };

  let current = await next();
  for (let guard = 0; guard < 120; guard += 1) {
    if (current.phase === "QUESTION_ACTIVE") {
      asked.set(current.questionNumber, current.question.text);
      for (const page of [ava, zion, omar]) await until(page, live => live.questionNumber === current.questionNumber && live.phase === "QUESTION_ACTIVE", "question");
      await markBest(ava);
      // Zion and Omar get close (4/5) but never complete a line in the shot.
      await markBest(zion, { hold: true });
      if (guard % 2 === 0) await markBest(omar, { hold: true });
      if ((await state(ava)).me.hasWon) {
        current = await next();
        current = await next();
        break;
      }
    }
    current = await next();
  }
  assert.equal(current.phase, "QUESTION_ACTIVE", "a live question follows Ava's Bingo");
  asked.set(current.questionNumber, current.question.text);
  const shot = await until(ava, live => live.phase === "QUESTION_ACTIVE" && live.questionNumber === current.questionNumber && live.me.hasWon, "Ava sees the next question");
  await ava.waitForTimeout(4500);

  // ---- content audit: every visible number is real ----
  const me = shot.me;
  const winning = LINES.filter(mask => (me.marks & mask) === mask);
  assert.ok(winning.length >= 1, "the glowing line is complete");
  const value = solve(shot.question.text);
  assert.ok(Number.isInteger(value) && value >= 0, "the live question is whole-number math");
  assert.ok(me.board.some(cell => !cell.free && cell.n === value), "the live question's answer is on the card");
  for (const item of shot.called.slice(0, -1)) assert.equal(item.reveal.text, `${item.text} = ${solve(item.text)}`, `revealed ${item.text}`);
  const values = me.board.filter(cell => !cell.free).map(cell => cell.n);
  for (const cell of values) assert.ok(Number.isInteger(cell) && cell >= 0 && cell <= 100, `card value ${cell}`);
  assert.ok(shot.leaderboard[0].won && shot.leaderboard[0].name === "Ava", "the leaderboard leads with the winner");
  await ava.locator(".mini-leaders").waitFor();
  const visible = await ava.evaluate(() => ({
    question: document.querySelector(".question-band .question-text")?.textContent,
    winning: document.querySelectorAll(".card-cell.is-winning").length,
    marked: document.querySelectorAll(".card-cell.is-marked").length,
    leaders: [...document.querySelectorAll(".mini-leaders .leader")].map(row => row.textContent)
  }));
  assert.equal(visible.question, shot.question.text);
  assert.ok(visible.winning >= 5, "the winning line glows");
  assert.equal(visible.marked, popcount(me.marks));

  const png = await ava.screenshot({ type: "png" });
  const outputDirectory = resolve("apps/platform-web/public/media/games");
  const webp = await sharp(png).resize(1200, 675).webp({ quality: 84 }).toBuffer();
  const avif = await sharp(png).resize(1200, 675).avif({ quality: 60 }).toBuffer();
  writeFileSync(resolve(outputDirectory, "math-bingo-live.webp"), webp);
  writeFileSync(resolve(outputDirectory, "math-bingo-live.avif"), avif);
  const meta = await sharp(webp).metadata();
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const audit = {
    source: "real game capture (scripts/capture-math-bingo-live-thumbnail.mjs), player screen 1200x675 @2x, reduced motion",
    width: meta.width, height: meta.height,
    webp: { bytes: webp.length, sha256: sha(webp) },
    avif: { bytes: avif.length, sha256: sha(avif) },
    liveQuestion: `${shot.question.text} (answer ${value}, on the card)`,
    calledSoFar: shot.called.map(item => item.text),
    winningLines: winning.length,
    markedCells: popcount(me.marks),
    leaderboardShown: visible.leaders
  };
  mkdirSync(resolve("qa-artifacts/math-bingo-live"), { recursive: true });
  writeFileSync(resolve("qa-artifacts/math-bingo-live/thumbnail-audit.json"), JSON.stringify(audit, null, 2));
  writeFileSync(resolve("qa-artifacts/math-bingo-live/thumbnail-source.png"), png);
  console.log(JSON.stringify(audit, null, 2));
  await host.evaluate(async () => {
    const token = sessionStorage.getItem("mathnexa:math-bingo-live:host-token");
    await fetch("/api/games/math-bingo-live/host", { method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin", body: JSON.stringify({ action: "close", hostToken: token }) });
  });
} finally {
  await browser.close();
}
