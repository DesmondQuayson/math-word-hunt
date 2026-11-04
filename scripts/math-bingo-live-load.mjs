/**
 * Math Bingo Live — HTTP load test through the real application.
 *
 * A signed-in host (a real browser, so the real session cookie) runs a room;
 * N students are simulated with plain HTTP clients that behave like the
 * student page: they poll the same endpoint at the same interval, join, mark
 * and use the Free Space. Measures, with percentiles:
 *   join latency, question delivery (host Next -> every student has seen it),
 *   mark validation, leaderboard update (mark -> host sees it), winner
 *   confirmation (mark -> host sees the Bingo), reconnect (fresh state call).
 * Then repeats with several rooms at once.
 *
 *   node scripts/run-math-bingo-live.mjs load            (starts the app)
 *   MATH_BINGO_LIVE_URL=... node scripts/math-bingo-live-load.mjs [--players 50] [--rooms 3] [--room-players 20]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const engine = "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/";
const { answerMatches } = await import(`${engine}questions.js`);
const { enabledLines, popcount } = await import(`${engine}board.js`);

const ORIGIN = process.env.MATH_BINGO_LIVE_URL ?? "http://127.0.0.1:3100";
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};
const PLAYERS = argument("players", 50);
const ROOMS = argument("rooms", 3);
const ROOM_PLAYERS = argument("room-players", 20);
const QUESTIONS = argument("questions", 6);
const POLL_MS = 1000;
const PLAY = `${ORIGIN}/api/games/math-bingo-live/play`;
const HEADERS = { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live", "Sec-Fetch-Site": "same-origin", Origin: ORIGIN };
const password = "BingoLoadTeacher42!";

const admin = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.SUPABASE_TEST_URL ?? "")) throw new Error("The load test is local-only.");

const stats = name => ({ name, samples: [] });
function summary(metric) {
  const sorted = metric.samples.slice().sort((a, b) => a - b);
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? null;
  return { metric: metric.name, n: sorted.length, p50: at(50), p95: at(95), max: sorted[sorted.length - 1] ?? null };
}

async function post(body, address) {
  const started = performance.now();
  const response = await fetch(PLAY, { method: "POST", headers: { ...HEADERS, "x-vercel-forwarded-for": address }, body: JSON.stringify(body) });
  const json = await response.json();
  return { status: response.status, json, ms: performance.now() - started };
}

async function teacher(index) {
  const email = `bingo-load-${index}@example.test`;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = listed.data.users.find(user => user.email === email);
  if (existing) await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  else {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
  }
  return email;
}

async function hostPage(browser, email) {
  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent("/games/math-bingo-live/host")}`);
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL(url => url.pathname === "/games/math-bingo-live/host", { timeout: 120_000 });
  await page.waitForFunction(() => document.body.dataset.screen === "setup" || document.body.dataset.screen === "lobby", null, { timeout: 60_000 });
  const host = async (action, extra = {}) => page.evaluate(async ({ action, extra }) => {
    const reply = await fetch("/api/games/math-bingo-live/host", {
      method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin",
      body: JSON.stringify({ action, hostToken: sessionStorage.getItem("mathnexa:math-bingo-live:host-token"), ...extra })
    });
    const json = await reply.json();
    if (json.hostToken) sessionStorage.setItem("mathnexa:math-bingo-live:host-token", json.hostToken);
    return json;
  }, { action, extra });
  return { context, page, host };
}

/** One room: host + n HTTP students. Returns the metrics. */
async function runRoom(browser, roomIndex, playerCount, metrics) {
  const email = await teacher(roomIndex);
  const { context, host } = await hostPage(browser, email);
  const created = await host("create", { settings: { mode: "multiplication", level: "x0-10", questionSeconds: 0, revealSeconds: 0, patterns: { rows: true, columns: true, diagonals: true }, winners: 3, freeSpace: true, music: "host", celebration: "host", equivalentFractions: false } });
  const code = created.state.code;
  const address = `198.18.${roomIndex}.1`;

  const students = await Promise.all(Array.from({ length: playerCount }, async (_, index) => {
    const joined = await post({ action: "join", code, name: `Load ${roomIndex}-${index + 1}` }, address);
    if (joined.status !== 200) throw new Error(`join ${index}: ${joined.status} ${JSON.stringify(joined.json)}`);
    metrics.join.samples.push(joined.ms);
    return { token: joined.json.token, state: joined.json.state, seenQuestion: 0 };
  }));
  const started = await host("start");
  if (started.result !== "started") throw new Error(`start: ${JSON.stringify(started)}`);

  // Background polling like the real page (1 s while a game is live).
  let polling = true;
  const pollers = students.map(async student => {
    while (polling) {
      const reply = await post({ action: "state", token: student.token }, address);
      if (reply.status === 200 && reply.json.state) {
        student.state = reply.json.state;
        if (student.state.phase === "QUESTION_ACTIVE" && student.state.questionNumber > student.seenQuestion) {
          student.seenQuestion = student.state.questionNumber;
          student.seenAt = performance.now();
        }
      }
      await new Promise(done => setTimeout(done, POLL_MS));
    }
  });

  await new Promise(done => setTimeout(done, 1500));
  let state = (await host("next", { phase: "COUNTDOWN", question: 0 })).state;
  for (let question = 1; question <= QUESTIONS && state.phase === "QUESTION_ACTIVE"; question += 1) {
    const sentAt = performance.now();
    // Question delivery: every student's own poll sees the new question.
    const deadline = Date.now() + 10_000;
    while (students.some(student => student.seenQuestion < state.questionNumber) && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
    for (const student of students) if (student.seenQuestion >= state.questionNumber) metrics.delivery.samples.push(student.seenAt - sentAt);

    // Everyone answers at once: the worst case for row locking.
    const answer = state.called[state.questionNumber - 1];
    const results = await Promise.all(students.map(async (student, index) => {
      const card = student.state.me.board;
      if (!card) return null;
      if (question === 1 && index % 4 === 0) {
        const free = await post({ action: "free", token: student.token, game: state.gameNumber, question: state.questionNumber }, address);
        metrics.mark.samples.push(free.ms);
      }
      const marks = student.state.me.marks;
      const options = card.map((cell, cellIndex) => cellIndex).filter(cellIndex => !card[cellIndex].free && ((marks >>> cellIndex) & 1) === 0);
      // The real answer is not in any student payload during the question:
      // students solve it from the text, as children do.
      const [a, op, b] = state.question.text.split(" ");
      const value = op === "×" ? Number(a) * Number(b) : NaN;
      const right = options.filter(cellIndex => answerMatches({ mode: "multiplication", equivalentFractions: false }, { n: value, d: 1 }, card[cellIndex]));
      if (!right.length) return null;
      const cell = right.sort((x, y) => Math.max(...enabledLines({ rows: true, columns: true, diagonals: true }).map(line => popcount((marks | (1 << y)) & line.mask)))
        - Math.max(...enabledLines({ rows: true, columns: true, diagonals: true }).map(line => popcount((marks | (1 << x)) & line.mask))))[0];
      const marked = await post({ action: "mark", token: student.token, game: state.gameNumber, question: state.questionNumber, cell }, address);
      metrics.mark.samples.push(marked.ms);
      if (marked.status === 200 && marked.json.state) student.state = marked.json.state;
      return { at: performance.now(), result: marked.json.result, won: marked.json.state?.me?.hasWon && marked.json.state?.me?.placement };
    }));
    void answer;
    const correct = results.filter(result => result?.result === "correct");
    // Leaderboard update / winner confirmation, as the host screen sees it.
    const hostSeenFrom = performance.now();
    const expectedCorrect = correct.length;
    let hostState;
    for (;;) {
      hostState = (await host("state")).state;
      const total = hostState.leaderboard.reduce((sum, row) => sum + row.correct, 0);
      if (total >= expectedCorrect || performance.now() - hostSeenFrom > 5000) break;
    }
    for (const result of correct) metrics.leaderboard.samples.push(performance.now() - result.at);
    for (const result of results.filter(item => item?.won)) metrics.winner.samples.push(performance.now() - result.at);
    if (hostState.phase !== "QUESTION_ACTIVE") break;
    state = (await host("next", { phase: "QUESTION_ACTIVE", question: state.questionNumber })).state;
    state = (await host("next", { phase: "ANSWER_REVEAL", question: state.questionNumber })).state;
  }

  // Reconnect: a fresh page load asks for the full state with no version.
  await Promise.all(students.slice(0, 20).map(async student => {
    const reply = await post({ action: "state", token: student.token }, address);
    metrics.reconnect.samples.push(reply.ms);
    if (reply.status !== 200) throw new Error("reconnect failed");
  }));

  polling = false;
  await Promise.all(pollers);
  const final = (await host("state")).state;
  await host("close");
  await context.close();
  return { code, players: final.players.length, winners: final.winners.length, questions: final.questionNumber, placements: final.winners.map(winner => winner.placement) };
}

const browser = await chromium.launch();
const report = { origin: ORIGIN, pollIntervalMs: POLL_MS, single: null, multi: null };
try {
  const single = { join: stats("join"), delivery: stats("question delivery"), mark: stats("mark validation"), leaderboard: stats("leaderboard update"), winner: stats("winner confirmation"), reconnect: stats("reconnect") };
  const startedAt = performance.now();
  const room = await runRoom(browser, 1, PLAYERS, single);
  report.single = { room, seconds: Math.round((performance.now() - startedAt) / 1000), metrics: Object.values(single).map(summary) };
  if (room.players !== PLAYERS) throw new Error(`expected ${PLAYERS} players, saw ${room.players}`);

  const multi = { join: stats("join"), delivery: stats("question delivery"), mark: stats("mark validation"), leaderboard: stats("leaderboard update"), winner: stats("winner confirmation"), reconnect: stats("reconnect") };
  const multiStarted = performance.now();
  const rooms = await Promise.all(Array.from({ length: ROOMS }, (_, index) => runRoom(browser, index + 2, ROOM_PLAYERS, multi)));
  report.multi = { rooms, seconds: Math.round((performance.now() - multiStarted) / 1000), metrics: Object.values(multi).map(summary) };
  const codes = new Set(rooms.map(item => item.code));
  if (codes.size !== ROOMS) throw new Error("room codes collided");
} finally {
  await browser.close();
}
mkdirSync(resolve("qa-artifacts/math-bingo-live"), { recursive: true });
writeFileSync(resolve("qa-artifacts/math-bingo-live/load-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`LOAD PASSED ${createHash("sha256").update(JSON.stringify(report.single.room)).digest("hex").slice(0, 8)}`);
