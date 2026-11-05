/**
 * Math Bingo Live — 50-player load test against a STAGING preview.
 *
 * Launched by scripts/invoke-math-bingo-live-staging.ps1 -Stage load
 * -Origin <staging preview URL>, which supplies the staging Supabase secret
 * key and the Vercel protection-bypass entry (never printed). One synthetic
 * FREE teacher is created on STAGING and deleted at the end with every room
 * it opened.
 *
 * The teacher runs the real host screen in Chromium (timed questions, so the
 * server advances the game on its own). Fifty virtual students join with a
 * code and a name and then behave like the real student page: they poll the
 * room at the page's own pace (1 s while a game runs, 2 s otherwise, with the
 * page's since/sinceMe versions), tap the right square 1.5–8 s into each
 * question, and sometimes tap a wrong one first. Every request comes from
 * this one machine, as a whole class behind one school address would.
 *
 * It measures request latency, status codes and whether every student saw
 * every question, then plays new games until LOAD_SECONDS (default 360) of
 * play have passed. Results: qa-artifacts/math-bingo-live/staging-load.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (!/^[A-Za-z0-9_-]{20,}$/.test(bypass)) throw new Error("missing protection-bypass entry");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
if (secretKey.length < 20) throw new Error("missing secret key");
const expectCommit = (process.env.EXPECT_COMMIT ?? "").trim();
const PLAYERS = Number(process.env.LOAD_PLAYERS ?? 50);
const LOAD_SECONDS = Number(process.env.LOAD_SECONDS ?? 360);
if (!Number.isInteger(PLAYERS) || PLAYERS < 1 || PLAYERS > 60) throw new Error("LOAD_PLAYERS must be 1–60 (the room limit)");
const out = resolve(process.env.REVIEW_OUT ?? "qa-artifacts/math-bingo-live/staging-load");
mkdirSync(out, { recursive: true });

const bypassHeaders = { "x-vercel-protection-bypass": bypass, "x-vercel-skip-toolbar": "1" };
// What the real student page sends: the game header plus Fetch Metadata and Origin (the API refuses anything else).
const apiHeaders = { ...bypassHeaders, "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live", "Sec-Fetch-Site": "same-origin", Origin: origin };
const PLAY = `${origin}/api/games/math-bingo-live/play`;
const HOST = "/games/math-bingo-live/host";
const ACTIVE = new Set(["COUNTDOWN", "QUESTION_ACTIVE", "ANSWER_REVEAL", "LEADERBOARD_UPDATE", "WINNER_REVEAL"]);

const admin = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomBytes(3).toString("hex");
const password = `${randomBytes(12).toString("base64url")}Aa1!`;
const users = [];
const codes = new Set();
const results = [];
const redact = (text) => String(text).split(bypass).join("[hidden]");
const ok = (condition, message) => {
  results.push(Boolean(condition));
  console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`);
  return Boolean(condition);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const jitter = (min, max) => min + Math.random() * (max - min);

/** Every request: action, HTTP status (0 = network error), milliseconds, and the API result word. */
const samples = [];
async function post(body) {
  const started = performance.now();
  try {
    const response = await fetch(PLAY, { method: "POST", headers: apiHeaders, body: JSON.stringify(body) });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* an HTML error page */ }
    samples.push({ who: "player", action: body.action, status: response.status, ms: performance.now() - started, result: json?.result ?? json?.error ?? null, at: Date.now() });
    return { status: response.status, json };
  } catch (error) {
    samples.push({ who: "player", action: body.action, status: 0, ms: performance.now() - started, result: String(error?.cause?.code ?? error?.message ?? error), at: Date.now() });
    return { status: 0, json: null };
  }
}

const ADD = { "+": (x, y) => x + y, "−": (x, y) => x - y, "×": (x, y) => x * y, "÷": (x, y) => x / y };
const value = (question) => {
  const [a, op, b] = String(question?.text ?? "").split(" ");
  return ADD[op]?.(Number(a), Number(b));
};

/** One virtual student, behaving like the real student page. */
function student(index, code) {
  const me = { name: `Load ${String(index + 1).padStart(2, "0")}`, token: null, state: null, seen: new Set(), marked: new Set(), stop: false, joined: false, boardDealt: false };
  const apply = (json) => {
    if (!json) return;
    if (json.result === "unchanged") return;
    if (json.state) me.state = json.state;
  };
  me.join = async () => {
    await sleep(jitter(0, 10_000));
    const reply = await post({ action: "join", code, name: me.name });
    me.joined = reply.status === 200 && typeof reply.json?.token === "string";
    if (me.joined) { me.token = reply.json.token; apply(reply.json); }
    return me.joined;
  };
  me.act = async () => {
    const s = me.state;
    if (!s || s.phase !== "QUESTION_ACTIVE" || !s.me?.board) return;
    me.boardDealt = true;
    const key = `${s.gameNumber}:${s.questionNumber}`;
    me.seen.add(key);
    if (me.marked.has(key) || s.me.hasWon || s.me.markUsed) return;
    me.marked.add(key);
    const { gameNumber: game, questionNumber: question } = s;
    setTimeout(async () => {
      if (me.stop) return;
      if (s.settings?.freeSpace !== false && s.me.board[12]?.free && ((s.me.marks >>> 12) & 1) === 0) {
        apply((await post({ action: "free", token: me.token, game, question })).json);
      }
      const want = value(s.question);
      const cells = s.me.board.map((cell, cellIndex) => ({ cell, cellIndex })).filter(({ cell }) => !cell.free);
      const right = cells.find(({ cell, cellIndex }) => cell.n === want && ((s.me.marks >>> cellIndex) & 1) === 0);
      if (Math.random() < 0.1) {
        const wrong = cells.find(({ cell }) => cell.n !== want);
        if (wrong) apply((await post({ action: "mark", token: me.token, game, question, cell: wrong.cellIndex })).json);
      }
      if (right) apply((await post({ action: "mark", token: me.token, game, question, cell: right.cellIndex })).json);
    }, jitter(1500, 8000));
  };
  me.loop = async () => {
    while (!me.stop) {
      const s = me.state;
      const reply = await post({ action: "state", token: me.token, ...(s ? { since: s.version, sinceMe: s.me?.version } : {}) });
      apply(reply.json);
      await me.act();
      await sleep(me.state && ACTIVE.has(me.state.phase) ? 1000 : 2000);
    }
  };
  return me;
}

function stats(list) {
  if (!list.length) return { n: 0 };
  const ms = list.map((sample) => sample.ms).sort((a, b) => a - b);
  const at = (q) => Math.round(ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]);
  return { n: ms.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: Math.round(ms[ms.length - 1]) };
}

const browsers = [];
const students = [];
const startedAt = Date.now();
let report = null;
let networkBaseline = null;
// The same no-database request, sampled every 2 s DURING play: if it slows down
// with the game requests, the delay is the platform or network, not the game.
const healthDuringPlay = [];
try {
  const health = await fetch(`${origin}/api/health`, { headers: bypassHeaders }).then((response) => response.json()).catch(() => null);
  ok(health && (!expectCommit || health.build === expectCommit), `staging build ${health?.build ?? "unknown"}${expectCommit ? ` is ${expectCommit}` : ""}`);
  // Network baseline: this machine to the deployment and back, for a request that does no database work.
  const baseline = [];
  for (let index = 0; index < 10; index += 1) {
    const started = performance.now();
    await fetch(`${origin}/api/health`, { headers: bypassHeaders }).then((response) => response.text()).catch(() => null);
    baseline.push({ ms: performance.now() - started });
  }
  networkBaseline = stats(baseline.slice(2));

  // The synthetic free teacher signs in and creates a timed room: 10 s questions, 3 s reveal, 10 winners.
  const email = `bingo-load-${run}-teacher@example.invalid`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "math-bingo-live-staging-load" } });
  if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  users.push(made.data.user.id);

  const chrome = await chromium.launch();
  browsers.push(chrome);
  const context = await chrome.newContext({ extraHTTPHeaders: bypassHeaders, viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const hostSamples = new Map();
  page.on("request", (request) => { if (request.url().includes("/api/games/math-bingo-live/host")) hostSamples.set(request, performance.now()); });
  page.on("requestfinished", async (request) => {
    if (!hostSamples.has(request)) return;
    const response = await request.response().catch(() => null);
    samples.push({ who: "host", action: "host", status: response?.status() ?? 0, ms: performance.now() - hostSamples.get(request), result: null, at: Date.now() });
    hostSamples.delete(request);
  });
  page.on("requestfailed", (request) => { if (hostSamples.has(request)) { samples.push({ who: "host", action: "host", status: 0, ms: 0, result: request.failure()?.errorText ?? "failed", at: Date.now() }); hostSamples.delete(request); } });
  page.on("pageerror", (error) => ok(false, `host page error: ${error.message}`));
  await page.goto(`${origin}/join?x-vercel-protection-bypass=${bypass}&x-vercel-set-bypass-cookie=true`, { waitUntil: "domcontentloaded" });
  await page.goto(`${origin}/sign-in?next=${encodeURIComponent(HOST)}`);
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname === HOST, { timeout: 120_000 });
  await page.waitForFunction(() => document.body.dataset.screen === "setup", null, { timeout: 60_000 });
  for (const [name, setting] of [["mode", "addition"], ["level", "facts-20"], ["questionSeconds", "10"], ["revealSeconds", "3"], ["winners", "10"]]) {
    await page.locator(`input[name="${name}"][value="${setting}"]`).click({ force: true });
  }
  await page.getByRole("button", { name: "CREATE GAME" }).click();
  await page.waitForFunction(() => /^\d{6}$/.test(window.__MATH_BINGO_LIVE__?.state?.code ?? ""), null, { timeout: 60_000 });
  const hostState = () => page.evaluate(() => window.__MATH_BINGO_LIVE__?.state ?? null);
  const room = await hostState();
  codes.add(room.code);
  ok(room.settings.questionSeconds === 10 && room.settings.winners === 10, `room ${room.code.slice(0, 2)}···· is timed (10 s questions, 10 winners)`);

  // A class of fifty joins within about ten seconds.
  for (let index = 0; index < PLAYERS; index += 1) students.push(student(index, room.code));
  const joinStarted = performance.now();
  const joined = await Promise.all(students.map((one) => one.join()));
  if (!ok(joined.every(Boolean), `${joined.filter(Boolean).length}/${PLAYERS} students joined (${Math.round(performance.now() - joinStarted)} ms for the class)`)) {
    const refusals = samples.filter((sample) => sample.action === "join" && sample.status !== 200).map((sample) => `${sample.status} ${sample.result}`);
    throw new Error(`joins refused: ${[...new Set(refusals)].join("; ")}`);
  }
  const loops = students.filter((one) => one.joined).map((one) => one.loop());
  await page.waitForFunction((count) => (window.__MATH_BINGO_LIVE__?.state?.players?.length ?? 0) === count, joined.filter(Boolean).length, { timeout: 30_000 })
    .catch(() => ok(false, "the host lobby did not list every student"));
  await page.screenshot({ path: resolve(out, "host-lobby.png") });

  // A host command from the page, retried: one dropped connection must not abort the run.
  const hostCommand = async (action) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const outcome = await page.evaluate(async (name) => {
        try {
          const response = await fetch("/api/games/math-bingo-live/host", {
            method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin",
            body: JSON.stringify({ action: name, hostToken: sessionStorage.getItem("mathnexa:math-bingo-live:host-token") })
          });
          return response.status;
        } catch {
          return 0;
        }
      }, action).catch(() => 0);
      if (outcome === 200) return true;
      await sleep(1000);
    }
    return false;
  };

  // Play games until the time budget is used.
  await page.getByRole("button", { name: "START GAME" }).click();
  const playStarted = Date.now();
  let probing = true;
  const prober = (async () => {
    while (probing) {
      const started = performance.now();
      const status = await fetch(`${origin}/api/health`, { headers: bypassHeaders }).then(async (response) => { await response.text(); return response.status; }).catch(() => 0);
      healthDuringPlay.push({ ms: performance.now() - started, status, at: Date.now() });
      await sleep(2000);
    }
  })();
  const games = [];
  const hostQuestions = new Set();
  let lastGame = 0;
  while (Date.now() - playStarted < LOAD_SECONDS * 1000) {
    const s = await hostState();
    if (s?.phase === "QUESTION_ACTIVE") hostQuestions.add(`${s.gameNumber}:${s.questionNumber}`);
    if (s?.phase === "GAME_COMPLETE" && s.gameNumber !== lastGame) {
      lastGame = s.gameNumber;
      games.push({ game: s.gameNumber, questions: s.questionNumber, winners: s.winners.map((winner) => ({ placement: winner.placement, name: winner.name })) });
      await page.screenshot({ path: resolve(out, `host-complete-game-${s.gameNumber}.png`) });
      if (Date.now() - playStarted > (LOAD_SECONDS - 45) * 1000) break;
      await sleep(5000);
      ok(await hostCommand("again"), `Play Again after game ${s.gameNumber}`);
    }
    await sleep(500);
  }
  const playSeconds = (Date.now() - playStarted) / 1000;
  for (const one of students) one.stop = true;
  probing = false;
  await Promise.all([...loops, prober]);
  await hostCommand("close");
  await context.close();

  // Findings.
  const during = samples.filter((sample) => sample.at >= playStarted);
  const by = (filter) => samples.filter(filter);
  const statuses = {};
  for (const sample of samples) statuses[sample.status] = (statuses[sample.status] ?? 0) + 1;
  const marks = {};
  for (const sample of by((sample) => sample.action === "mark")) marks[sample.result ?? "none"] = (marks[sample.result ?? "none"] ?? 0) + 1;
  const reference = new Set([...hostQuestions, ...students.flatMap((one) => [...one.seen])]);
  const coverage = students.filter((one) => one.joined).map((one) => one.seen.size / Math.max(1, reference.size));
  report = {
    origin: origin.replace(/staging-[a-z0-9]+-/, "staging-·····-"),
    build: health?.build ?? null,
    players: PLAYERS,
    playSeconds: Math.round(playSeconds),
    games,
    questionsRun: reference.size,
    requests: samples.length,
    requestsPerSecondDuringPlay: Math.round((during.length / playSeconds) * 10) / 10,
    statuses,
    marks,
    latency: {
      join: stats(by((sample) => sample.action === "join")),
      state: stats(by((sample) => sample.action === "state")),
      stateUnchanged: stats(by((sample) => sample.action === "state" && sample.result === "unchanged")),
      stateChanged: stats(by((sample) => sample.action === "state" && sample.result !== "unchanged")),
      mark: stats(by((sample) => sample.action === "mark")),
      free: stats(by((sample) => sample.action === "free")),
      host: stats(by((sample) => sample.who === "host"))
    },
    worstCoverage: Math.round(Math.min(...coverage) * 1000) / 10,
    boardsDealt: students.filter((one) => one.boardDealt).length,
    networkBaseline,
    healthDuringPlay: { ...stats(healthDuringPlay), failed: healthDuringPlay.filter((sample) => sample.status !== 200).length },
    notOk: samples.filter((sample) => sample.status !== 200).map(({ who, action, status, result, at }) => ({ who, action, status, result, secondsIntoPlay: Math.round((at - playStarted) / 1000) }))
  };
  writeFileSync(resolve(out, `load-report-${PLAYERS}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const serverErrors = samples.filter((sample) => sample.status >= 500 || sample.status === 0);
  const limited = samples.filter((sample) => sample.status === 429);
  ok(serverErrors.length === 0, `no server or network errors (${serverErrors.length}${serverErrors.length ? `: ${[...new Set(serverErrors.map((sample) => `${sample.action} ${sample.status} ${sample.result}`))].slice(0, 5).join("; ")}` : ""})`);
  ok(limited.length === 0, `no request was rate-limited from one shared address (${limited.length})`);
  ok(games.length >= 1 && games.every((game) => game.winners.length >= 1 && game.winners.length <= 10 && new Set(game.winners.map((winner) => winner.placement)).size === game.winners.length), `${games.length} game(s) completed with 1–10 winners in distinct places`);
  ok(report.boardsDealt === joined.filter(Boolean).length, `every student got a card (${report.boardsDealt})`);
  ok(report.worstCoverage >= 95, `every student saw at least 95% of the questions (worst ${report.worstCoverage}%)`);
  ok((report.latency.state.p95 ?? Infinity) <= 1000, `room polls p95 ${report.latency.state.p95} ms (limit 1000)`);
  ok((report.latency.mark.p95 ?? Infinity) <= 1500, `marks p95 ${report.latency.mark.p95} ms (limit 1500)`);
  ok((report.latency.host.p95 ?? Infinity) <= 1500, `host requests p95 ${report.latency.host.p95} ms (limit 1500)`);
  ok((marks.correct ?? 0) > 0 && !Object.keys(marks).some((result) => /unavailable|invalid/.test(result)), `marks: ${Object.entries(marks).map(([result, count]) => `${result} ${count}`).join(", ")}`);
} catch (error) {
  ok(false, `load test aborted: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const one of students) one.stop = true;
  for (const browser of browsers) await browser.close().catch(() => {});
  for (const code of codes) await admin.from("bingo_rooms").delete().eq("code", code);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  console.log(`cleanup: ${users.length} synthetic account(s) and ${codes.size} room(s) deleted; ${Math.round((Date.now() - startedAt) / 1000)} s total`);
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
