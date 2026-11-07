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

// The student page's own polling rule, so the virtual class polls exactly like phones do.
import { DEADLINE_SPREAD_MS, pollInterval, reconcile } from "../apps/platform-web/public/internal-games/math-bingo-live/src/api.js";
import { EMOJI_CHOICES } from "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/emoji.js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (!/^[A-Za-z0-9_-]{20,}$/.test(bypass)) throw new Error("missing protection-bypass entry");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
if (secretKey.length < 20) throw new Error("missing secret key");
const expectCommit = (process.env.EXPECT_COMMIT ?? "").trim();
const PLAYERS = Number(process.env.LOAD_PLAYERS ?? 50);
const LOAD_SECONDS = Number(process.env.LOAD_SECONDS ?? 480);
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
/** Server-Timing from the game API: db (database calls), access (host sign-in check), app (whole handler). */
function serverTiming(header) {
  const out = {};
  for (const part of String(header ?? "").split(",")) {
    const match = /^\s*(db|access|app);dur=([0-9.]+)/.exec(part);
    if (match) out[match[1]] = Number(match[2]);
    const calls = /^\s*db;dur=[0-9.]+;desc="(\d+)"/.exec(part);
    if (calls) out.calls = Number(calls[1]);
  }
  return out;
}
async function post(body, tag = null) {
  const started = performance.now();
  try {
    const response = await fetch(PLAY, { method: "POST", headers: apiHeaders, body: JSON.stringify(body) });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* an HTML error page */ }
    samples.push({ who: "player", action: body.action, tag, status: response.status, ms: performance.now() - started, result: json?.result ?? json?.error ?? null, at: Date.now(), ...serverTiming(response.headers.get("server-timing")) });
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

/**
 * The same-answer burst: on question 1 of game 1 every student taps their own
 * matching square at the same server-clock instant (question start + 3 s),
 * then sends the same tap again. Every first tap must be accepted (nobody
 * consumes an answer) and no repeat may count.
 */
const BURST_KEY = "1:1";
const burst = { valid: 0, accepted: 0, results: {}, repeats: 0, repeatsCounted: 0, samples: [] };

/** One virtual student, behaving like the real student page (most pick an emoji; some share one, some pick none). */
function student(index, code) {
  const emoji = index % 6 === 5 ? null : EMOJI_CHOICES[index % 9].emoji;
  const me = { name: `Load ${String(index + 1).padStart(2, "0")}`, emoji, token: null, state: null, seen: new Set(), marked: new Set(), stop: false, joined: false, boardDealt: false, clockOffset: 0 };
  const apply = (json) => {
    if (!json) return;
    if (json.result === "unchanged") return;
    // Like the student page: keep the newest room AND the newest own seat (replies arrive out of order).
    if (json.state) me.state = reconcile(me.state, json.state);
  };
  me.join = async () => {
    await sleep(jitter(0, 10_000));
    const reply = await post({ action: "join", code, name: me.name, emoji: me.emoji });
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
    if (key === BURST_KEY && typeof s.timing?.questionStartedAt === "number") {
      const want = value(s.question);
      const right = s.me.board.map((cell, cellIndex) => ({ cell, cellIndex })).find(({ cell, cellIndex }) => !cell.free && cell.n === want && ((s.me.marks >>> cellIndex) & 1) === 0);
      if (right) {
        burst.valid += 1;
        const fireAt = s.timing.questionStartedAt + 3000 - me.clockOffset;
        setTimeout(async () => {
          if (me.stop) return;
          const started = performance.now();
          const first = await post({ action: "mark", token: me.token, game, question, cell: right.cellIndex }, "burst");
          burst.samples.push({ ms: performance.now() - started });
          const result = first.json?.result ?? first.json?.error ?? String(first.status);
          burst.results[result] = (burst.results[result] ?? 0) + 1;
          if (result === "correct") burst.accepted += 1;
          apply(first.json);
          const again = await post({ action: "mark", token: me.token, game, question, cell: right.cellIndex }, "burst");
          burst.repeats += 1;
          if (again.json?.result === "correct") burst.repeatsCounted += 1;
          apply(again.json);
        }, Math.max(0, fireAt - Date.now()));
        return;
      }
    }
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
  // Like api.js createLiveSession: the room-size interval, or the phase deadline
  // (+120 ms and a random spread) when that comes first, on the server clock.
  let clockOffset = 0;
  const learnClock = (json) => {
    const serverNow = json?.serverNow ?? json?.state?.timing?.serverNow;
    if (typeof serverNow === "number") clockOffset = serverNow - Date.now();
    me.clockOffset = clockOffset;
  };
  me.loop = async () => {
    while (!me.stop) {
      const s = me.state;
      const reply = await post({ action: "state", token: me.token, ...(s ? { since: s.version, sinceMe: s.me?.version } : {}) });
      learnClock(reply.json);
      apply(reply.json);
      await me.act();
      const current = me.state;
      let wait = current && ACTIVE.has(current.phase) ? pollInterval(1000, current.playerCount) : 2000;
      const deadline = current?.timing?.phaseDeadline;
      if (typeof deadline === "number") {
        const untilDeadline = deadline - (Date.now() + clockOffset) + 120 + Math.random() * DEADLINE_SPREAD_MS;
        if (untilDeadline > 0 && untilDeadline < wait) wait = untilDeadline;
      }
      await sleep(Math.max(150, wait));
    }
  };
  return me;
}

function stats(list, key = "ms") {
  list = list.filter((sample) => typeof sample[key] === "number");
  if (!list.length) return { n: 0 };
  const ms = list.map((sample) => sample[key]).sort((a, b) => a - b);
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
// A trivial Supabase read (one catalog row through the REST API) from this
// machine every 2 s during play: is the Supabase API slow for everything, or
// only for the game's calls?
const supabaseDuringPlay = [];
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

  // The synthetic free teacher signs in and creates a timed room: Addition within 50,
  // 10 s questions, 3 s reveal, 2 winners (a paced game of 25 calls fits the time budget).
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
    samples.push({ who: "host", action: "host", status: response?.status() ?? 0, ms: performance.now() - hostSamples.get(request), result: null, at: Date.now(), ...serverTiming(response?.headers()["server-timing"]) });
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
  for (const [name, setting] of [["mode", "addition"], ["level", "within-50"], ["questionSeconds", "10"], ["revealSeconds", "3"], ["winners", "2"]]) {
    await page.locator(`input[name="${name}"][value="${setting}"]`).click({ force: true });
  }
  await page.getByRole("button", { name: "CREATE GAME" }).click();
  await page.waitForFunction(() => /^\d{6}$/.test(window.__MATH_BINGO_LIVE__?.state?.code ?? ""), null, { timeout: 60_000 });
  const hostState = () => page.evaluate(() => window.__MATH_BINGO_LIVE__?.state ?? null);
  const room = await hostState();
  codes.add(room.code);
  ok(room.settings.questionSeconds === 10 && room.settings.winners === 2, `room ${room.code.slice(0, 2)}···· is timed (10 s questions, 2 winners)`);

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
      const readStarted = performance.now();
      const read = await admin.from("game_catalog_entries").select("stable_key").limit(1).then((result) => (result.error ? 0 : 200), () => 0);
      supabaseDuringPlay.push({ ms: performance.now() - readStarted, status: read, at: Date.now() });
      await sleep(2000);
    }
  })();
  const games = [];
  const hostQuestions = new Set();
  let emojiInStandings = 0;
  let lastGame = 0;
  while (Date.now() - playStarted < LOAD_SECONDS * 1000) {
    const s = await hostState();
    if (s?.phase === "QUESTION_ACTIVE") hostQuestions.add(`${s.gameNumber}:${s.questionNumber}`);
    if (s?.phase === "GAME_COMPLETE" && s.gameNumber !== lastGame) {
      lastGame = s.gameNumber;
      const calledIds = s.called.map((item) => item.id);
      emojiInStandings = Math.max(emojiInStandings, s.leaderboard.filter((row) => row.emoji).length);
      games.push({ game: s.gameNumber, questions: s.questionNumber, calledIds: calledIds.length, uniqueCalledIds: new Set(calledIds).size,
        winners: s.winners.map((winner) => ({ placement: winner.placement, name: winner.name, emoji: winner.emoji, question: winner.question })) });
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
      // Taps outside the deliberate same-answer burst (comparable with earlier rounds, which had no burst).
      markOrdinary: stats(by((sample) => sample.action === "mark" && sample.tag !== "burst")),
      free: stats(by((sample) => sample.action === "free")),
      host: stats(by((sample) => sample.who === "host"))
    },
    worstCoverage: Math.round(Math.min(...coverage) * 1000) / 10,
    boardsDealt: students.filter((one) => one.boardDealt).length,
    networkBaseline,
    // Where the time went (Server-Timing): inside the handler (app), in database calls (db),
    // in the host's sign-in check (access), and outside the handler (client total minus app:
    // network, the platform's routing and queueing, the proxy).
    serverTiming: Object.fromEntries(["state", "mark", "free", "host"].map((action) => {
      const list = by((sample) => (action === "host" ? sample.who === "host" : sample.action === action) && typeof sample.app === "number")
        .map((sample) => ({ ...sample, outside: sample.ms - sample.app }));
      return [action, { app: stats(list, "app"), db: stats(list, "db"), access: stats(list, "access"), outside: stats(list, "outside") }];
    })),
    // A poll that made two database calls dealt the student's card itself (should be ~0 now that Start deals them).
    pollsThatDealtACard: by((sample) => sample.action === "state" && sample.calls === 2).length,
    sameAnswerBurst: { valid: burst.valid, accepted: burst.accepted, results: burst.results, repeats: burst.repeats, repeatsCounted: burst.repeatsCounted, latency: stats(burst.samples) },
    emojiInStandings,
    healthDuringPlay: { ...stats(healthDuringPlay), failed: healthDuringPlay.filter((sample) => sample.status !== 200).length },
    supabaseDuringPlay: { ...stats(supabaseDuringPlay), failed: supabaseDuringPlay.filter((sample) => sample.status !== 200).length },
    // Poll latency per 10 s of play (p50/p95/max, with the trivial Supabase read's max in the same window).
    timeline: Array.from({ length: Math.ceil(playSeconds / 10) }, (_, window) => {
      const from = playStarted + window * 10_000;
      const inWindow = (sample) => sample.at >= from && sample.at < from + 10_000;
      const polls = stats(by((sample) => sample.action === "state" && inWindow(sample)));
      const reads = stats(supabaseDuringPlay.filter(inWindow));
      return { second: window * 10, polls: polls.n, p50: polls.p50, p95: polls.p95, max: polls.max, supabaseReadMax: reads.max ?? null };
    }),
    notOk: samples.filter((sample) => sample.status !== 200).map(({ who, action, status, result, at }) => ({ who, action, status, result, secondsIntoPlay: Math.round((at - playStarted) / 1000) }))
  };
  writeFileSync(resolve(out, `load-report-${PLAYERS}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const serverErrors = samples.filter((sample) => sample.status >= 500 || sample.status === 0);
  const limited = samples.filter((sample) => sample.status === 429);
  ok(serverErrors.length === 0, `no server or network errors (${serverErrors.length}${serverErrors.length ? `: ${[...new Set(serverErrors.map((sample) => `${sample.action} ${sample.status} ${sample.result}`))].slice(0, 5).join("; ")}` : ""})`);
  ok(limited.length === 0, `no request was rate-limited from one shared address (${limited.length})`);
  ok(games.length >= 1 && games.every((game) => game.winners.length >= 1 && game.winners.length <= 2 && new Set(game.winners.map((winner) => winner.placement)).size === game.winners.length), `${games.length} game(s) completed with 1–2 winners in distinct places`);
  ok(games.every((game) => game.winners.every((winner, index) => winner.question >= (index === 0 ? 15 : game.winners[index - 1].question + 10))), `every Bingo kept the pacing: ${games.map((game) => game.winners.map((winner) => winner.question).join("/")).join(", ")}`);
  ok(report.boardsDealt === joined.filter(Boolean).length, `every student got a card (${report.boardsDealt})`);
  ok(burst.valid >= joined.filter(Boolean).length * 0.9 && burst.accepted === burst.valid, `same-answer burst: ${burst.accepted}/${burst.valid} simultaneous taps of the same answer accepted (${Object.entries(burst.results).map(([result, count]) => `${result} ${count}`).join(", ")}; p95 ${report.sameAnswerBurst.latency.p95} ms)`);
  ok(burst.repeats > 0 && burst.repeatsCounted === 0, `no repeated submission counted (${burst.repeatsCounted}/${burst.repeats})`);
  ok(games.every((game) => game.calledIds > 0 && game.calledIds === game.uniqueCalledIds), `no question repeated in any game (${games.map((game) => `${game.uniqueCalledIds}/${game.calledIds}`).join(", ")})`);
  ok(emojiInStandings > 0, `standings carry the students' emoji (${emojiInStandings} rows)`);
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
