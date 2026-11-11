/**
 * Math Bingo Live — real-browser review of a STAGING deployment.
 *
 * Launched by scripts/invoke-math-bingo-live-staging.ps1 -Stage review
 * -Origin <staging preview URL>, which supplies the staging Supabase secret
 * key and the Vercel protection-bypass entry (Deployment Protection is not
 * changed; scripts/vercel-protection-bypass.mjs sends the value once, in a
 * header, to the preview origin only, and every browser request afterwards
 * rides on Vercel's host-only bypass cookie; the value never enters a URL and
 * is never printed). One synthetic FREE teacher (no subscription) is created on
 * STAGING and deleted at the end with every room it opened. Students join
 * with a code and a name only, in separate browsers (Chromium and WebKit),
 * and play a real game to three Bingos under the real route CSP.
 *
 * Also checks, read-only, that production (https://mathnexa.com) still does
 * not serve the draft.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (!/^[A-Za-z0-9_-]{20,}$/.test(bypass)) throw new Error("missing protection-bypass entry");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
if (secretKey.length < 20) throw new Error("missing secret key");
const expectCommit = (process.env.EXPECT_COMMIT ?? "").trim();
const out = resolve(process.env.REVIEW_OUT ?? "qa-artifacts/math-bingo-live/staging");
mkdirSync(out, { recursive: true });
const protection = createProtectionBypass({ origin, secret: bypass });
// A direct request to the preview: the bypass header only for its own origin, and no redirect is followed.
const direct = (url) => fetch(url, { headers: protection.headersFor(url), redirect: "manual" });
const landing = `${origin}/join`;
const HOST = "/games/math-bingo-live/host";

const admin = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomBytes(3).toString("hex");
const password = `${randomBytes(12).toString("base64url")}Aa1!`;
const users = [];
const codes = new Set();
const results = [];
const redact = (text) => protection.redact(text);
const ok = (condition, message) => {
  results.push(Boolean(condition));
  console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`);
  return Boolean(condition);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function freeTeacher() {
  const email = `bingo-staging-${run}-teacher@example.invalid`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "math-bingo-live-staging-review" } });
  if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  users.push(made.data.user.id);
  return email;
}

async function open(engine, options) {
  const context = await engine.newContext(options);
  await protection.install(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => { if (!/due to access control checks/.test(error.message)) ok(false, `page error: ${error.message}`); });
  await page.goto(landing, { waitUntil: "domcontentloaded" });
  return { context, page };
}

const state = (page) => page.evaluate(() => window.__MATH_BINGO_LIVE__?.state ?? null);
async function until(page, want, label, timeout = 45_000) {
  // A function, never a string: the game pages' CSP forbids eval.
  await page.waitForFunction((want) => {
    const s = window.__MATH_BINGO_LIVE__?.state;
    if (!s) return false;
    if (want.phase && s.phase !== want.phase) return false;
    if (want.phases && !want.phases.includes(s.phase)) return false;
    if (want.question !== undefined && s.questionNumber !== want.question) return false;
    if (want.minWinners !== undefined && s.winnerCount < want.minWinners) return false;
    if (want.board && !s.me?.board) return false;
    if (want.players !== undefined && (s.players?.length ?? -1) !== want.players) return false;
    return true;
  }, want, { timeout }).catch(() => ok(false, `timeout: ${label}`));
  return state(page);
}

async function hostCommand(page, action, extra = {}) {
  return page.evaluate(async ({ action, extra }) => {
    const reply = await fetch("/api/games/math-bingo-live/host", {
      method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin",
      body: JSON.stringify({ action, hostToken: sessionStorage.getItem("mathnexa:math-bingo-live:host-token"), ...extra })
    });
    return reply.json();
  }, { action, extra });
}

/** The best matching square for the live question; with hold, never one that completes a line. */
function decide(page, hold) {
  return page.evaluate(({ hold }) => {
    const s = window.__MATH_BINGO_LIVE__.state;
    if (!s || s.phase !== "QUESTION_ACTIVE" || !s.me?.board || s.me.hasWon || s.me.markUsed) return null;
    const [a, op, b] = s.question.text.split(" ");
    const x = Number(a);
    const y = Number(b);
    const value = { "+": x + y, "−": x - y, "×": x * y, "÷": x / y }[op];
    const lines = [31, 992, 31744, 1015808, 32505856, 1082401, 2164802, 4329604, 8659208, 17318416, 17043521, 1118480];
    const kinds = ["rows", "rows", "rows", "rows", "rows", "columns", "columns", "columns", "columns", "columns", "diagonals", "diagonals"];
    const allowed = lines.filter((_, index) => s.settings.patterns[kinds[index]]);
    const count = (mask) => { let total = 0; for (let v = mask >>> 0; v; v &= v - 1) total += 1; return total; };
    let best = null;
    s.me.board.forEach((cell, index) => {
      if (cell.free || ((s.me.marks >>> index) & 1) === 1 || cell.n !== value) return;
      const score = Math.max(...allowed.map((mask) => count((s.me.marks | (1 << index)) & mask)));
      if (hold && score >= 5) return;
      if (!best || score > best.score) best = { cell: index, score };
    });
    return best ? { cell: best.cell, game: s.gameNumber, question: s.questionNumber } : null;
  }, { hold });
}

async function markByTap(page, hold) {
  const choice = await decide(page, hold);
  if (!choice) return null;
  const reply = page.waitForResponse((response) => response.url().endsWith("/api/games/math-bingo-live/play") && (response.request().postData() ?? "").includes("\"mark\""));
  await page.bringToFront();
  await page.locator(`[data-cell="${choice.cell}"]`).tap();
  return (await (await reply).json()).result;
}

async function markByRequest(page, hold) {
  const choice = await decide(page, hold);
  if (!choice) return null;
  return page.evaluate(async (choice) => {
    const seat = JSON.parse(sessionStorage.getItem("mathnexa:math-bingo-live:seat") ?? "{}");
    const reply = await fetch("/api/games/math-bingo-live/play", {
      method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin",
      body: JSON.stringify({ action: "mark", token: seat.token, ...choice })
    });
    return (await reply.json()).result;
  }, choice);
}

/** The host board at one screen size: no page scroll, every panel on screen and in its place. */
async function board(page, width, height, label) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const r = (selector) => { const element = document.querySelector(selector); if (!element) return null; const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; };
    return {
      scrollH: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), scrollW: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      parts: Object.fromEntries(["host-head", "ways-strip", "panel-standings", "panel-winners", "panel-question", "host-timer", "panel-called", "controls"].map((name) => [name, r(`.${name}`)]))
    };
  });
  ok(m.scrollH <= height + 1 && m.scrollW <= width + 1, `${label} ${width}x${height}: page does not scroll (${m.scrollW}x${m.scrollH})`);
  const off = Object.entries(m.parts).filter(([, b]) => !b || b.w < 1 || b.x < -1 || b.y < -1 || b.right > width + 1 || b.bottom > height + 1).map(([name]) => name);
  ok(off.length === 0, `${label} ${width}x${height}: header, winning ways, standings, winners, question, timer, called and controls on screen${off.length ? ` (off: ${off.join(", ")})` : ""}`);
  const p = m.parts;
  ok(p["panel-standings"].right <= p["panel-question"].x + 1 && p["panel-question"].bottom <= p["panel-called"].y + 1 && p["panel-standings"].bottom <= p["panel-winners"].y + 1,
    `${label} ${width}x${height}: standings left, question top right, winners under standings, called under the question`);
  await page.screenshot({ path: resolve(out, `host-${label}-${width}x${height}.png`) });
}

const ways = (page, selector) => page.evaluate((selector) => Object.fromEntries([...document.querySelectorAll(`${selector} [data-pattern]`)]
  .map((item) => [item.dataset.pattern, item.classList.contains("is-on")])), selector);

const browsers = [];
try {
  // Build identity.
  const health = await direct(`${origin}/api/health`).then((response) => response.json()).catch(() => null);
  ok(health && (!expectCommit || health.build === expectCommit), `staging build ${health?.build ?? "unknown"}${expectCommit ? ` is ${expectCommit}` : ""}`);

  // Production (read-only): the game was published there with v1.2.35 (2026-11-05),
  // so /join is served; 404 would mean it was archived or rolled back.
  const productionJoin = await fetch("https://mathnexa.com/join", { redirect: "manual" });
  ok(productionJoin.status === 200, `production /join serves the published game (status ${productionJoin.status})`);

  // Anonymous: /join is open (code + name only); the host screen asks for an account.
  const anonymousJoin = await direct(`${origin}/join`);
  ok(anonymousJoin.status === 200 && (anonymousJoin.headers.get("content-security-policy") ?? "").includes("connect-src 'self'"), `staging /join serves the student page with its CSP (${anonymousJoin.status})`);
  const anonymousHost = await direct(`${origin}${HOST}`);
  ok(anonymousHost.status === 307 && (anonymousHost.headers.get("location") ?? "").includes(`/access?next=${HOST}`), `anonymous host screen goes to sign-in (${anonymousHost.status})`);
  // The catalog registration: /games/math-bingo-live/play only points at the host screen.
  const playAddress = await direct(`${origin}/games/math-bingo-live/play`);
  ok(playAddress.status === 307 && new URL(playAddress.headers.get("location") ?? "/", origin).pathname === HOST, `/games/math-bingo-live/play points at the host screen (${playAddress.status})`);

  const chrome = await chromium.launch();
  const safari = await webkit.launch();
  browsers.push(chrome, safari);

  // The free teacher signs in and creates a room: Addition within 50 (240 different
  // questions: Bingo pacing allows 3 winners), rows + columns, no diagonals, 3 winners, manual pace.
  const email = await freeTeacher();
  const host = await open(chrome, { viewport: { width: 1366, height: 768 } });
  await host.page.goto(`${origin}/sign-in?next=${encodeURIComponent(HOST)}`);
  await host.page.getByLabel("Email address").fill(email);
  await host.page.locator('input[name="password"]').first().fill(password);
  await host.page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await host.page.waitForURL((url) => url.pathname === HOST, { timeout: 120_000 });
  await host.page.waitForFunction(() => document.body.dataset.screen === "setup", null, { timeout: 60_000 });
  ok(true, "a free MathNexa account (no subscription) opens the host screen");
  await host.page.locator("#winners-count").fill("3");
  for (const [name, value] of [["mode", "addition"], ["level", "within-50"], ["questionSeconds", "0"], ["revealSeconds", "0"]]) {
    await host.page.locator(`input[name="${name}"][value="${value}"]`).click({ force: true });
  }
  if (await host.page.locator('input[name="diagonals"]').isChecked()) await host.page.locator('input[name="diagonals"]').click({ force: true });
  await host.page.getByRole("button", { name: "CREATE GAME" }).click();
  await host.page.waitForFunction(() => /^\d{6}$/.test(window.__MATH_BINGO_LIVE__?.state?.code ?? ""), null, { timeout: 60_000 });
  const room = await state(host.page);
  codes.add(room.code);
  ok(room.settings.patterns.rows && room.settings.patterns.columns && !room.settings.patterns.diagonals, "the room's winning ways are rows + columns");

  // Students: code + name only, in three different browsers and screen sizes.
  const join = async (engine, name, options, emoji = null) => {
    const student = await open(engine, options);
    // The QR code's link: the room is already identified, so name (+ emoji) and Join.
    await student.page.goto(`${origin}/join?code=${room.code}`);
    await student.page.getByLabel("YOUR NAME").fill(name);
    if (emoji) await student.page.getByLabel(emoji, { exact: true }).check({ force: true });
    await student.page.getByRole("button", { name: "JOIN GAME" }).click();
    await student.page.getByText("You're in!").waitFor({ timeout: 60_000 });
    return { name, ...student };
  };
  const ava = await join(safari, "Ava", { viewport: { width: 390, height: 844 }, hasTouch: true });
  const zion = await join(chrome, "Zion", { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const omar = await join(chrome, "Omar", { viewport: { width: 1024, height: 768 } });
  const lobby = await until(host.page, { phase: "LOBBY", players: 3 }, "lobby with three players");
  ok(lobby.players.map((player) => player.name).sort().join(",") === "Ava,Omar,Zion", "the host lobby lists Ava, Zion and Omar");
  await host.page.screenshot({ path: resolve(out, "host-lobby-1366x768.png") });

  await host.page.getByRole("button", { name: "START GAME" }).click();
  for (const student of [ava, zion, omar]) await until(student.page, { phase: "QUESTION_ACTIVE", board: true }, `${student.name} question 1`, 60_000);
  const cards = await Promise.all([ava, zion, omar].map(async (student) => (await state(student.page)).me.board));
  const distinct = (card) => new Set(card.filter((cell) => !cell.free).map((cell) => cell.n)).size;
  ok(cards.every((card) => card.length === 25 && distinct(card) === 24 && card[12].free) && new Set(cards.map((card) => card.map((cell) => cell.free ? "F" : cell.n).join(","))).size === 3, "every card holds 24 different answers in its own layout, Free Space in the middle");
  // The gates live in the database only: read them there (service key), never from a screen.
  const pacingOf = async () => (await admin.from("bingo_rooms").select("pacing").eq("code", room.code).eq("status", "open").maybeSingle()).data?.pacing ?? null;
  const drawn = await pacingOf();
  ok(drawn && [14, 15, 16, 17].includes(drawn.firstWinCall) && drawn.nextEligibleCall === drawn.firstWinCall && Array.isArray(drawn.gaps) && drawn.gaps.length === 0,
    `the server drew this game's first winner gate: call ${drawn?.firstWinCall} (one of 14-17)`);
  const hostText = JSON.stringify(await state(host.page));
  const studentText = JSON.stringify(await state(ava.page));
  ok(!/nextEligibleCall|firstWinCall|winnerEvents/.test(hostText + studentText) && (await host.page.locator(".head-pacing").count()) === 0 && (await ava.page.locator(".pacing-line").count()) === 0,
    "no screen shows or receives the winner gates (no countdown on the host or a student screen)");
  ok(JSON.stringify(await ways(host.page, ".ways-strip")) === JSON.stringify({ rows: true, columns: true, diagonals: false })
    && JSON.stringify(await ways(ava.page, ".rules")) === JSON.stringify({ rows: true, columns: true, diagonals: false }), "host and student winning ways match the room (rows, columns; no diagonals)");
  await board(host.page, 1280, 720, "question");
  await board(host.page, 1920, 1080, "question");
  await host.page.setViewportSize({ width: 1366, height: 768 });

  // Play: everyone plays their best (Ava with real taps in WebKit); the server paces the Bingos.
  let firstChecked = false;
  let current = await state(host.page);
  for (let guard = 0; guard < 120 && current.phase === "QUESTION_ACTIVE"; guard += 1) {
    const question = current.questionNumber;
    for (const student of [ava, zion, omar]) await until(student.page, { phase: "QUESTION_ACTIVE", question }, `${student.name} sees question ${question}`);
    const avaResult = await markByTap(ava.page, false);
    if (avaResult) ok(avaResult === "correct", `Ava's tap on question ${question} is correct`);
    for (const student of [zion, omar]) {
      const result = await markByRequest(student.page, false);
      if (result && result !== "correct") ok(false, `${student.name} mark ${result}`);
    }
    await sleep(1500);
    current = await state(host.page);
    if (!firstChecked && current.winnerCount >= 1 && current.winnerCount < 3 && current.phase !== "GAME_COMPLETE") {
      firstChecked = true;
      const firstNames = current.winners.map((winner) => winner.name).join(",");
      ok(current.winners[0].question >= drawn.firstWinCall, `the first Bingo (${firstNames}) came at call ${current.winners[0].question}, not before the drawn gate ${drawn.firstWinCall}`);
      await host.page.locator(".panel-winners .winner-name").first().waitFor();
      ok((await host.page.locator(".panel-winners .winner-name").allTextContents()).join(",") === firstNames, `Bingo Winners lists ${firstNames}`);
      ok(/^Winners [12] \/ 3( · last call)?$/.test((await host.page.locator(".panel-winners .panel-meta").textContent()) ?? ""), `Winners ${current.winnerCount} / 3`);
      const banner = await host.page.locator(".board-left > .banner").textContent().catch(() => "");
      ok(!/null|undefined/.test(banner ?? ""), "the Bingo announcement has no stray text");
      await board(host.page, 1280, 720, "one-winner");
      await board(host.page, 1920, 1080, "one-winner");
      await host.page.setViewportSize({ width: 1366, height: 768 });
      await ava.page.screenshot({ path: resolve(out, "student-ava-webkit-390x844-bingo.png") });
    }
    if (["WINNER_REVEAL", "GAME_COMPLETE"].includes(current.phase) && current.winnerCount >= 3) break;
    // Reveal, then on to the next question.
    for (let step = 0; step < 12; step += 1) {
      current = await state(host.page);
      if (current.phase === "QUESTION_ACTIVE" && current.questionNumber > question) break;
      if (current.phase === "GAME_COMPLETE") break;
      if (["QUESTION_ACTIVE", "ANSWER_REVEAL", "LEADERBOARD_UPDATE", "COUNTDOWN"].includes(current.phase)) await hostCommand(host.page, "next", { phase: current.phase, question: current.questionNumber });
      await sleep(900);
    }
    if (current.phase === "QUESTION_ACTIVE" && current.questionNumber === question) await sleep(1500);
    current = await state(host.page);
  }
  const final = await until(host.page, { phase: "GAME_COMPLETE" }, "game complete", 30_000);
  const names = final?.winners?.map((winner) => winner.name) ?? [];
  const winners = final?.winners ?? [];
  const expected = winners.map((winner, index) => { const first = winners.findIndex((other) => other.question === winner.question); return first === index ? index + 1 : first + 1; });
  ok(winners.length === 3 && new Set(names).size === 3 && names.every((name) => ["Ava", "Zion", "Omar"].includes(name)) && winners.every((winner, index) => winner.placement === expected[index]),
    `three winners: ${winners.map((winner) => `${winner.placement}. ${winner.name}`).join(", ")} (same-call winners share the place)`);
  const played = await pacingOf();
  const events = played?.winnerEvents ?? [];
  ok(played && events.length >= 1 && events[0].n >= played.firstWinCall && played.gaps.every((gap) => gap >= 8 && gap <= 11)
    && events.every((event, index) => index === 0 || event.n >= events[index - 1].n + played.gaps[index - 1]),
    `Bingos at calls ${winners.map((winner) => winner.question).join(", ")}: first gate ${played?.firstWinCall}, gaps drawn ${(played?.gaps ?? []).join(", ")} — no new winner before its gate`);
  ok(final?.winners?.every((winner) => winner.lineType === "row" || winner.lineType === "column"), "every Bingo is a row or a column (diagonals are off)");
  await host.page.locator(".complete-title").waitFor({ timeout: 30_000 });
  ok(true, "MATH BINGO COMPLETE shown on the host");
  await host.page.screenshot({ path: resolve(out, "host-complete-1366x768.png") });

  await hostCommand(host.page, "close");
  for (const student of [ava, zion, omar]) await student.context.close();
  await host.context.close();
} catch (error) {
  ok(false, `review aborted: ${error instanceof Error ? error.message.split("\nCall log:")[0] : String(error)}`);
} finally {
  for (const browser of browsers) await browser.close().catch(() => {});
  for (const code of codes) await admin.from("bingo_rooms").delete().eq("code", code);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  console.log(`cleanup: ${users.length} synthetic account(s) and ${codes.size} room(s) deleted`);
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
