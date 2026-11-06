/**
 * Math Bingo Live — final gameplay checks through the REAL application (local).
 *
 *  1. Answer independence: 50 students join (with and without emoji, some
 *     sharing one), and on several questions ALL of them submit their own
 *     correct square at the same instant. Every valid submission must be
 *     accepted, a repeated submission never counted, every card left exactly
 *     as its own marks say, and the leaderboard valid.
 *  2. No repeated question: a full match in every mode (Addition,
 *     Subtraction, Multiplication, Division, Mixed, Fraction Bingo; teacher
 *     presses Next until the game ends) — count(question ids) must equal
 *     count(unique question ids) in the Called history the screens get AND in
 *     the stored deck; 5 + 7 and 7 + 5 never both; the same answer from
 *     different questions is allowed.
 *
 *   MATH_BINGO_LIVE_URL=http://127.0.0.1:3101 SUPABASE_TEST_URL=... SUPABASE_TEST_SECRET_KEY=... \
 *     node scripts/math-bingo-live-final-gameplay.mjs
 * Local-only (refuses a non-loopback Supabase). Uses the demo teacher of
 * scripts/run-math-bingo-live.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const engine = "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/";
const { answerMatches } = await import(`${engine}questions.js`);
const { EMOJI_CHOICES } = await import(`${engine}emoji.js`);

const ORIGIN = (process.env.MATH_BINGO_LIVE_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(ORIGIN)) throw new Error("Local-only.");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.SUPABASE_TEST_URL ?? "")) throw new Error("Local Supabase only.");
const admin = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const TEACHER = { email: "bingo-teacher@example.test", password: "BingoTeacher42!" };
const PLAY = `${ORIGIN}/api/games/math-bingo-live/play`;
const HEADERS = { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live", "Sec-Fetch-Site": "same-origin", Origin: ORIGIN };
const PLAYERS = Number(process.env.SAME_ANSWER_PLAYERS ?? 50);

const results = [];
const ok = (condition, message) => {
  results.push(Boolean(condition));
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
  return Boolean(condition);
};

async function post(body) {
  const response = await fetch(PLAY, { method: "POST", headers: { ...HEADERS, "x-vercel-forwarded-for": "198.18.7.1" }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() };
}

const SOLVE = { "+": (a, b) => a + b, "−": (a, b) => a - b, "×": (a, b) => a * b, "÷": (a, b) => a / b };
function solve(question) {
  if (question.kind === "fraction") {
    const [n, d] = question.text.split("/").map(Number);
    return { n, d };
  }
  const [a, op, b] = question.text.split(" ");
  return { n: SOLVE[op](Number(a), Number(b)), d: 1 };
}

const settings = (mode, level, extra = {}) => ({
  mode, level, questionSeconds: 0, revealSeconds: 0, patterns: { rows: true, columns: true, diagonals: true },
  winners: 0, freeSpace: true, music: "off", celebration: "off", equivalentFractions: false, ...extra
});

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: ORIGIN });
const page = await context.newPage();
await page.goto(`/sign-in?next=${encodeURIComponent("/games/math-bingo-live/host")}`);
await page.getByLabel("Email address").fill(TEACHER.email);
await page.locator('input[name="password"]').first().fill(TEACHER.password);
await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
await page.waitForURL(url => url.pathname === "/games/math-bingo-live/host", { timeout: 120_000 });
// Let the host page finish its own start-up (it resumes a live room) before
// this script creates rooms, or that resume would take over the new room.
await page.waitForFunction(() => document.body.dataset.screen === "setup" || document.body.dataset.screen === "lobby", null, { timeout: 60_000 });
const host = async (action, extra = {}) => page.evaluate(async ({ action, extra }) => {
  const reply = await fetch("/api/games/math-bingo-live/host", {
    method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin",
    // The script keeps its own host token (not the page's sessionStorage, which
    // the page clears when the room it resumed at start-up is closed).
    body: JSON.stringify({ action, hostToken: window.__scriptHostToken ?? null, ...extra })
  });
  const json = await reply.json();
  if (json.hostToken) window.__scriptHostToken = json.hostToken;
  return json;
}, { action, extra }).then(json => {
  if (!json.state) console.log(`host ${action} -> ${JSON.stringify(json).slice(0, 300)}`);
  return json;
});

const report = { origin: ORIGIN, sameAnswer: null, matches: [] };
try {
  // ------------------------------------------------------------ 1. same answer, 50 at once
  const created = await host("create", { settings: settings("addition", "facts-20") });
  const code = created.state.code;
  const emojiFor = index => (index % 5 === 4 ? null : index % 7 === 0 ? "\u{1F981}" : EMOJI_CHOICES[index % EMOJI_CHOICES.length].emoji);
  const students = [];
  for (let index = 0; index < PLAYERS; index += 1) {
    const joined = await post({ action: "join", code, name: `Kid ${index + 1}`, emoji: emojiFor(index) });
    if (joined.status !== 200) throw new Error(`join ${index}: ${joined.status} ${JSON.stringify(joined.json)}`);
    students.push({ token: joined.json.token, state: joined.json.state, emoji: emojiFor(index), accepted: 0 });
  }
  ok(students.every(student => student.state.me.emoji === student.emoji), `${PLAYERS} students joined; each kept the emoji they chose (or none), shared emoji allowed`);
  const lion = students.filter(student => student.emoji === "\u{1F981}").length;
  ok(lion >= 2, `${lion} students share 🦁`);
  const started = await host("start");
  ok(started.result === "started", `Start deals every card in one request (${started.result ?? started.error})`);
  let state = (await host("next", { phase: "COUNTDOWN", question: 0 })).state;
  const burst = { questions: 0, submissions: 0, accepted: 0, refusedValid: 0, duplicatesCounted: 0, results: {} };
  for (let round = 0; round < 4 && state.phase === "QUESTION_ACTIVE"; round += 1) {
    // Everyone has the current state (their card, the question).
    await Promise.all(students.map(async student => {
      const reply = await post({ action: "state", token: student.token });
      student.state = reply.json.state;
    }));
    const answer = solve(state.question);
    const plans = students.map(student => {
      const card = student.state.me.board;
      const cell = card.findIndex((item, index) => !item.free && ((student.state.me.marks >>> index) & 1) === 0 && answerMatches(state.settings, answer, item));
      return { student, cell };
    });
    const valid = plans.filter(plan => plan.cell >= 0 && !plan.student.state.me.hasWon);
    // A barrier: every request leaves in the same tick.
    let release;
    const gate = new Promise(done => { release = done; });
    const fired = valid.map(async plan => {
      await gate;
      return { plan, reply: await post({ action: "mark", token: plan.student.token, game: state.gameNumber, question: state.questionNumber, cell: plan.cell }) };
    });
    release();
    const replies = await Promise.all(fired);
    burst.questions += 1;
    burst.submissions += replies.length;
    for (const { plan, reply } of replies) {
      const result = reply.json.result ?? reply.json.error;
      burst.results[result] = (burst.results[result] ?? 0) + 1;
      if (result === "correct") {
        burst.accepted += 1;
        plan.student.accepted += 1;
      } else {
        burst.refusedValid += 1;
      }
    }
    ok(replies.every(({ reply }) => reply.json.result === "correct"), `question ${state.questionNumber} (${state.question.text}): ${replies.length}/${replies.length} simultaneous valid answers accepted`);
    // The same submission again, all at once: never counted twice.
    const again = await Promise.all(valid.map(plan => post({ action: "mark", token: plan.student.token, game: state.gameNumber, question: state.questionNumber, cell: plan.cell })));
    const counted = again.filter(reply => reply.json.result === "correct").length;
    burst.duplicatesCounted += counted;
    ok(counted === 0 && again.every(reply => ["already-marked", "mark-used", "already-won"].includes(reply.json.result)), `question ${state.questionNumber}: repeated submissions refused (${[...new Set(again.map(reply => reply.json.result))].join(", ")})`);
    state = (await host("next", { phase: "QUESTION_ACTIVE", question: state.questionNumber })).state;
    if (state.phase === "ANSWER_REVEAL") state = (await host("next", { phase: "ANSWER_REVEAL", question: state.questionNumber })).state;
  }
  // Cards: each player's own marks only, one per accepted answer.
  const room = await admin.from("bingo_rooms").select("id, deck").eq("code", code).eq("status", "open").single();
  const rows = await admin.from("bingo_participants").select("token_hash, marks, correct_count, free_used, board").eq("room_id", room.data.id);
  const popcount = mask => { let count = 0; for (let value = mask >>> 0; value; value &= value - 1) count += 1; return count; };
  const intact = rows.data.every(row => popcount(row.marks) === row.correct_count + (row.free_used ? 1 : 0));
  ok(intact && rows.data.length === PLAYERS, `every card is intact: marks = its own accepted answers (${PLAYERS} rows)`);
  const totalCorrect = rows.data.reduce((sum, row) => sum + row.correct_count, 0);
  ok(totalCorrect === burst.accepted, `accepted answers ${burst.accepted} = stored correct marks ${totalCorrect}`);
  const hostView = (await host("state")).state;
  const ranks = hostView.leaderboard.map(row => row.rank);
  ok(hostView.leaderboard.length === PLAYERS && new Set(ranks).size === PLAYERS && Math.min(...ranks) === 1 && Math.max(...ranks) === PLAYERS, "leaderboard: every player once, ranks 1..50");
  ok(hostView.leaderboard.reduce((sum, row) => sum + row.correct, 0) === totalCorrect, "leaderboard totals match the cards");
  ok(hostView.leaderboard.filter(row => row.emoji === "\u{1F981}").length === lion, "standings show each player's emoji");
  report.sameAnswer = { players: PLAYERS, ...burst };
  await host("close");

  // ------------------------------------------------------------ 2. full matches, every mode
  for (const [mode, level, extra] of [
    ["addition", "facts-20"], ["subtraction", "facts-20"], ["multiplication", "x0-10"], ["division", "facts-10"],
    ["mixed", "core"], ["fractions", "to-sixths"], ["fractions", "to-eighths", { equivalentFractions: true }]
  ]) {
    const made = await host("create", { settings: settings(mode, level, { ...extra, winners: 1 }) });
    const joined = await post({ action: "join", code: made.state.code, name: "Ava", emoji: "\u{1F981}" });
    if (joined.status !== 200) throw new Error(`join for ${mode}: ${JSON.stringify(joined.json)}`);
    await host("start");
    let current = (await host("next", { phase: "COUNTDOWN", question: 0 })).state;
    // Nobody marks: the teacher calls every question until the deck runs out.
    for (let guard = 0; guard < 260 && current.phase !== "GAME_COMPLETE"; guard += 1) {
      current = (await host("next", { phase: current.phase, question: current.questionNumber })).state;
    }
    const called = current.called;
    const ids = called.map(item => item.id);
    const stored = await admin.from("bingo_rooms").select("deck").eq("code", made.state.code).eq("status", "open").single();
    const storedIds = stored.data.deck.map(entry => entry.q);
    const orderless = called.filter(item => / [+×] /.test(item.text)).map(item => {
      const [a, op, b] = item.text.split(" ");
      return `${op}:${Math.min(Number(a), Number(b))}:${Math.max(Number(a), Number(b))}`;
    });
    const byAnswer = new Map();
    for (const item of called) {
      const key = item.reveal ? `${item.reveal.answer.n}/${item.reveal.answer.d}` : "?";
      byAnswer.set(key, (byAnswer.get(key) ?? 0) + 1);
    }
    const sharedAnswers = [...byAnswer.values()].filter(count => count > 1).length;
    const label = `${mode}/${level}${extra?.equivalentFractions ? " (equivalent)" : ""}`;
    ok(current.phase === "GAME_COMPLETE" && current.completedReason === "deck", `${label}: full match to the end of the deck (${called.length} questions)`);
    ok(ids.length > 0 && ids.every(Boolean) && new Set(ids).size === ids.length, `${label}: count(question ids) ${ids.length} === count(unique) ${new Set(ids).size} (Called history)`);
    ok(storedIds.length === ids.length && new Set(storedIds).size === storedIds.length, `${label}: the stored deck has no repeat either`);
    ok(new Set(orderless).size === orderless.length, `${label}: never both a + b and b + a (or a × b and b × a)`);
    if (mode === "fractions" && !extra?.equivalentFractions) ok(new Set(called.map(item => item.text)).size === called.length, `${label}: each fraction called once`);
    report.matches.push({ mode, level, equivalentFractions: Boolean(extra?.equivalentFractions), questions: ids.length, unique: new Set(ids).size, sharedAnswers });
    if (mode === "addition") ok(sharedAnswers > 0, `${label}: the same answer came from different questions (${sharedAnswers} answers asked more than once)`);
    await host("close");
  }
} finally {
  await browser.close();
}
mkdirSync(resolve("qa-artifacts/math-bingo-live"), { recursive: true });
writeFileSync(resolve("qa-artifacts/math-bingo-live/final-gameplay-report.json"), JSON.stringify(report, null, 2));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
