/**
 * Math Bingo Live — PRODUCTION gameplay QA after a release (owner-approved,
 * final gameplay release). Launched by
 * `scripts/invoke-math-bingo-live-production.ps1 -Stage qa`, which loads only
 * the production project ref and service key.
 *
 * No account and no password: the TEACHER side of a synthetic room is driven
 * through the room's own service-role functions (exactly what the host API
 * calls after its sign-in check), and every STUDENT uses the real public
 * production endpoints at https://mathnexa.com — plain HTTP clients like the
 * staging load test, plus two real browsers (WebKit and Chromium at phone
 * sizes) that open the join link the teacher's QR code encodes. Students never
 * need an account, so nothing here signs in anywhere.
 *
 * Checks: deployed runtime and QR destination; join with emoji / no emoji /
 * shared emoji / refused emoji and names; Start refuses a repeating deck;
 * cards dealt at Start; 50 students submitting the same answer at the same
 * instant (all accepted, repeats never counted); Free Space announcements with
 * emoji; one win per player; the configured winner limit; leaderboard; unique
 * Called history; reconnect; rematch; Fraction Bingo (each fraction once);
 * close. Every synthetic room is deleted at the end (participants cascade).
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, devices, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const engine = "../apps/platform-web/public/internal-games/math-bingo-live/src/";
const { buildAnswerPool, buildDeck, dealRules, answerMatches } = await import(`${engine}engine/questions.js`);
const { dealCard } = await import(`${engine}engine/board.js`);
const { normalizeSettings, DEFAULT_SETTINGS } = await import(`${engine}engine/settings.js`);
const { EMOJI_CHOICES } = await import(`${engine}engine/emoji.js`);
const { joinLink } = await import(`${engine}join-link.js`);

// QA_TARGET=staging rehearses this script on a staging preview (launched by
// invoke-math-bingo-live-staging.ps1 -Stage qa); the default is production.
const STAGING = process.env.QA_TARGET === "staging";
const ORIGIN = STAGING ? (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "") : "https://mathnexa.com";
if (STAGING && !/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(ORIGIN)) throw new Error("STAGING_ORIGIN must be a staging preview");
const bypass = STAGING ? (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim() : "";
// Staging only: scripts/vercel-protection-bypass.mjs confines the secret to the preview origin (headers on direct
// requests that never follow a redirect; browsers ride on Vercel's host-only bypass cookie). Production: no secret,
// so headersFor() adds nothing and install() is a no-op.
const protection = createProtectionBypass({ origin: ORIGIN, secret: bypass || null });
const PLAY = `${ORIGIN}/api/games/math-bingo-live/play`;
const HEADERS = { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live", "Sec-Fetch-Site": "same-origin", Origin: ORIGIN, "User-Agent": "MathNexa-Release-QA/1.0" };
const ref = STAGING ? "gcmuhzxkwvfireyrearl" : (process.env.SUPABASE_PRODUCTION_PROJECT_REF ?? "").trim().toLowerCase();
const secretKey = ((STAGING ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PRODUCTION_SECRET_KEY) ?? "").trim();
if (!/^[a-z]{20}$/.test(ref) || (!STAGING && ref === "gcmuhzxkwvfireyrearl")) throw new Error("production project ref missing or wrong");
if (secretKey.length < 20) throw new Error("production service key missing");
const admin = createClient(`https://${ref}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const redact = (text) => protection.redact(String(text).split(secretKey).join("[hidden]").split(ref).join("[ref]"));

const results = [];
const evidence = { startedAt: new Date().toISOString(), checks: [] };
const ok = (condition, message) => {
  results.push(Boolean(condition));
  evidence.checks.push(`${condition ? "ok" : "FAIL"} ${message}`);
  console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`);
  return Boolean(condition);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const rpc = async (fn, args) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${redact(error.message)}`);
  return data;
};
async function post(body) {
  const response = await fetch(PLAY, { method: "POST", headers: { ...protection.headersFor(PLAY), ...HEADERS }, body: JSON.stringify(body), redirect: "manual" });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return { status: response.status, json };
}
const settingsFor = (overrides) => {
  const result = normalizeSettings({ ...DEFAULT_SETTINGS, questionSeconds: 0, revealSeconds: 0, music: "off", celebration: "host", ...overrides });
  if (!result.ok) throw new Error(result.error);
  return result.settings;
};
async function freeCode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = String(randomInt(100_000, 1_000_000));
    const taken = await admin.from("bingo_rooms").select("id", { count: "exact", head: true }).eq("code", candidate);
    if (!taken.error && taken.count === 0) return candidate;
  }
  throw new Error("no free room code");
}
/** The same game the host API builds (server.ts buildGame / dealBoards). */
function buildGame(settings, seed, playerIds) {
  const pool = buildAnswerPool(settings, seed);
  const deck = buildDeck(settings, pool, seed).map((question) => ({ q: question.id, t: question.text, s: question.spoken, k: question.kind, n: question.answer.n, d: question.answer.d }));
  const rules = dealRules(settings);
  const boards = Object.fromEntries(playerIds.map((id) => [id, dealCard({ pool, seed, participantId: id, ...rules })]));
  return { pool, deck, boards };
}
const SOLVE = { "+": (a, b) => a + b, "−": (a, b) => a - b, "×": (a, b) => a * b, "÷": (a, b) => a / b };
const solve = (question) => {
  if (question.kind === "fraction") { const [n, d] = question.text.split("/").map(Number); return { n, d }; }
  const [a, op, b] = question.text.split(" ");
  return { n: SOLVE[op](Number(a), Number(b)), d: 1 };
};

const rooms = [];
const browsers = [];
try {
  // --------------------------------------------------- deployed runtime + QR destination
  const page = await fetch(`${ORIGIN}/join`, { headers: { ...protection.headersFor(`${ORIGIN}/join`), "User-Agent": HEADERS["User-Agent"] }, redirect: "manual" });
  const html = await page.text();
  const runtimeHash = /MATH_BINGO_LIVE_RUNTIME_SHA256 = "([0-9a-f]{64})"/.exec(readFileSync("apps/platform-web/features/games/math-bingo-live/document.ts", "utf8"))[1];
  ok(page.status === 200 && html.includes(`src/player.js?v=${runtimeHash.slice(0, 16)}`), `/join serves this release's game runtime (v=${runtimeHash.slice(0, 16)})`);
  const joinLinkUrl = `${ORIGIN}/internal-games/math-bingo-live/src/join-link.js?v=${runtimeHash.slice(0, 16)}`;
  const served = await fetch(joinLinkUrl, { headers: protection.headersFor(joinLinkUrl), redirect: "manual" }).then((response) => response.text());
  ok(served.includes(`export const PRODUCTION_ORIGIN = "https://mathnexa.com";`), "the served QR code helper points production at https://mathnexa.com");
  ok(joinLink("537636", { host: "mathnexa.com", origin: ORIGIN }) === "https://mathnexa.com/join?code=537636"
    && joinLink("537636", { host: "www.mathnexa.com", origin: "https://www.mathnexa.com" }) === "https://mathnexa.com/join?code=537636", "a production teacher screen's QR encodes https://mathnexa.com/join?code=… (also from www)");

  // ------------------------------------------------------------------- room A: arithmetic
  const ownerA = hash(`bingo-production-qa-${randomBytes(16).toString("hex")}`);
  const tokenA = hash(randomBytes(32).toString("hex"));
  const settingsA = settingsFor({ mode: "addition", level: "facts-20", winners: 2, patterns: { rows: true, columns: true, diagonals: true } });
  const codeA = await freeCode();
  const created = await rpc("bingo_create_room", { p_code: codeA, p_owner_hash: ownerA, p_host_token_hash: tokenA, p_settings: settingsA });
  rooms.push(tokenA);
  const roomIdA = (await admin.from("bingo_rooms").select("id").eq("host_token_hash", tokenA).single()).data.id;
  ok(created.result === "created", `synthetic room ${codeA.slice(0, 2)}···· created (Addition, 2 winners)`);
  const host = (command, args = {}) => rpc("bingo_host_command", { p_owner_hash: ownerA, p_token_hash: tokenA, p_command: command, p_args: args });
  const hostState = () => rpc("bingo_host_state", { p_owner_hash: ownerA, p_token_hash: tokenA, p_since_version: null, p_since_progress: null });

  // Students: refused inputs first, then 50 over HTTP (emoji / none / shared).
  const badEmoji = await post({ action: "join", code: codeA, name: "Eve", emoji: "<img src=x>" });
  const badName = await post({ action: "join", code: codeA, name: "<b>Eve</b>" });
  ok(badEmoji.status === 400 && badEmoji.json?.error === "emoji-invalid", "an emoji off the list is refused (400 emoji-invalid)");
  ok(badName.status === 400 && badName.json?.error === "name-invalid", "a name with markup is refused (400 name-invalid)");
  const emojiFor = (index) => (index % 5 === 4 ? null : index % 7 === 0 ? "\u{1F981}" : EMOJI_CHOICES[index % EMOJI_CHOICES.length].emoji);
  const students = [];
  for (let start = 0; start < 50; start += 10) {
    const batch = await Promise.all(Array.from({ length: 10 }, (_, offset) => start + offset).map(async (index) => {
      const reply = await post({ action: "join", code: codeA, name: `QA ${String(index + 1).padStart(2, "0")}`, emoji: emojiFor(index) });
      return { index, emoji: emojiFor(index), status: reply.status, token: reply.json?.token, state: reply.json?.state };
    }));
    students.push(...batch);
  }
  ok(students.every((student) => student.status === 200 && student.token && (student.state?.me?.emoji ?? null) === student.emoji),
    "50 students joined with only a code and a name; each kept their emoji (or none), shared emoji allowed");

  // Two real phone browsers open the QR link: the room is already identified.
  const phones = [];
  for (const [engineName, browserType, device, name, emojiLabel] of [["webkit", webkit, devices["iPhone 13"], "QA Phone", "Lion"], ["chromium", chromium, devices["Pixel 7"], "QA Droid", "Rocket"]]) {
    const browser = await browserType.launch();
    browsers.push(browser);
    const context = await browser.newContext({ ...device });
    await protection.install(context);
    const phone = await context.newPage();
    const errors = [];
    phone.on("pageerror", (error) => errors.push(error.message));
    // The link the teacher's QR code encodes on this deployment.
    await phone.goto(joinLink(codeA, new URL(ORIGIN)));
    await phone.getByText(`Game ${codeA.slice(0, 3)} ${codeA.slice(3)}`).waitFor({ timeout: 30_000 });
    const codeScreen = await phone.locator("#code").count();
    await phone.getByLabel("YOUR NAME").fill(name);
    await phone.getByLabel(emojiLabel, { exact: true }).check({ force: true });
    await phone.getByRole("button", { name: "JOIN GAME" }).click();
    await phone.getByText("You're in!").waitFor({ timeout: 30_000 });
    const shown = await phone.locator(".youre-in-name").textContent();
    phones.push({ engineName, phone, errors, name });
    ok(codeScreen === 0 && shown?.includes(name) && /^\S+ /.test(shown ?? ""), `${engineName} phone: the QR link opened name + emoji directly (no code to type) and joined as "${shown}"`);
  }
  // Late joiner by hand: the numeric code still works.
  const manual = await post({ action: "join", code: `${codeA.slice(0, 3)} ${codeA.slice(3)}`, name: "QA Typed" });
  ok(manual.status === 200 && manual.json?.token, "the numeric code typed by hand still joins");
  students.push({ index: 50, emoji: null, status: manual.status, token: manual.json?.token, state: manual.json?.state });

  // Start: a repeating deck is refused; the real deck starts with every card dealt.
  let view = await hostState();
  const ids = view.players.map((player) => player.id);
  const seedA = randomBytes(16).toString("hex");
  const gameA = buildGame(settingsA, seedA, ids);
  const repeated = await rpc("bingo_host_start", { p_owner_hash: ownerA, p_token_hash: tokenA, p_kind: "start", p_settings: settingsA, p_seed: seedA, p_pool: gameA.pool, p_deck: [...gameA.deck, gameA.deck[0]], p_boards: gameA.boards });
  ok(repeated.result === "invalid-game" && repeated.phase === "LOBBY", "production Start refuses a deck that repeats a question");
  ok(new Set(gameA.deck.map((entry) => entry.q)).size === gameA.deck.length, `the release deck has ${gameA.deck.length} questions, none repeated`);
  const started = await rpc("bingo_host_start", { p_owner_hash: ownerA, p_token_hash: tokenA, p_kind: "start", p_settings: settingsA, p_seed: seedA, p_pool: gameA.pool, p_deck: gameA.deck, p_boards: gameA.boards });
  ok(started.result === "started" && Number(started.dealt) === ids.length, `Start dealt every card in one request (${started.dealt}/${ids.length})`);
  view = await host("next", { phase: "COUNTDOWN", question: 0 });
  ok(view.phase === "QUESTION_ACTIVE" && view.questionNumber === 1, "question 1 is live");

  const refresh = async (student) => {
    const reply = await post({ action: "state", token: student.token });
    if (reply.status === 200 && reply.json?.state) student.state = reply.json.state;
    return reply;
  };
  await Promise.all(students.map(refresh));
  const question1 = students[0].state.question;
  const plans = students.slice(0, 50).map((student) => ({ student, cell: student.state.me.board.findIndex((cell, index) => !cell.free && ((student.state.me.marks >>> index) & 1) === 0 && answerMatches(settingsA, solve(question1), cell)) }));
  // Independent answers: all 50 tap their own square in the same tick.
  let release;
  const gate = new Promise((done) => { release = done; });
  const burst = plans.map(async (plan) => { await gate; return post({ action: "mark", token: plan.student.token, game: 1, question: 1, cell: plan.cell }); });
  release();
  const firstTaps = await Promise.all(burst);
  ok(plans.every((plan) => plan.cell >= 0) && firstTaps.every((reply) => reply.json?.result === "correct"),
    `50 students submitted the same answer (${question1.text}) at the same instant: ${firstTaps.filter((reply) => reply.json?.result === "correct").length}/50 accepted`);
  const repeats = await Promise.all(plans.map((plan) => post({ action: "mark", token: plan.student.token, game: 1, question: 1, cell: plan.cell })));
  ok(repeats.every((reply) => reply.json?.result === "already-marked"), "the same 50 submissions repeated: none counted (already-marked)");
  // The phones mark too, on their own cards, through the real page.
  for (const { engineName, phone } of phones) {
    await phone.waitForFunction(() => window.__MATH_BINGO_LIVE__?.state?.phase === "QUESTION_ACTIVE" && Boolean(window.__MATH_BINGO_LIVE__.state.me?.board), null, { timeout: 30_000 }).catch(() => {});
    const state = await phone.evaluate(() => window.__MATH_BINGO_LIVE__?.state ?? null);
    let marked = false;
    if (state?.phase === "QUESTION_ACTIVE" && state.me?.board) {
      const index = state.me.board.findIndex((cell, cellIndex) => !cell.free && ((state.me.marks >>> cellIndex) & 1) === 0 && answerMatches(settingsA, solve(state.question), cell));
      const reply = phone.waitForResponse((response) => response.url().endsWith("/api/games/math-bingo-live/play") && (response.request().postData() ?? "").includes("\"mark\""));
      await phone.locator(`[data-cell="${index}"]`).dispatchEvent("click");
      marked = (await (await reply).json()).result === "correct";
    }
    ok(marked, `${engineName} phone marked its own square for the same question`);
  }
  // Free Space with emoji.
  const freeUsers = students.filter((student) => student.emoji).slice(2, 5);
  const frees = await Promise.all(freeUsers.map((student) => post({ action: "free", token: student.token, game: 1, question: 1 })));
  view = await hostState();
  const freeEvents = view.events.filter((event) => event.type === "free-space");
  ok(frees.every((reply) => reply.json?.result === "free-space") && freeEvents.length >= 3 && freeEvents.every((event) => event.emoji),
    `Free Space announcements carry the students' emoji (${freeEvents.map((event) => `${event.emoji} ${event.name}`).join(", ")})`);
  // Cards are each player's own.
  const rows = await admin.from("bingo_participants").select("marks, correct_count, free_used").eq("room_id", roomIdA);
  const popcount = (mask) => { let count = 0; for (let value = mask >>> 0; value; value &= value - 1) count += 1; return count; };
  ok(rows.data.every((row) => popcount(row.marks) === row.correct_count + (row.free_used ? 1 : 0)), `every card holds exactly its own marks (${rows.data.length} cards)`);

  // Play on: Ava (student 0) and Zion (student 1) play every question perfectly; nobody else taps.
  const ava = students[0];
  const zion = students[1];
  const winnerOrder = [];
  let alreadyWon = null;
  let afterLimit = null;
  for (let guard = 0; guard < 120; guard += 1) {
    view = await hostState();
    if (view.phase !== "QUESTION_ACTIVE") {
      if (view.phase === "ANSWER_REVEAL" || view.phase === "LEADERBOARD_UPDATE") { await host("next", { phase: view.phase, question: view.questionNumber }); continue; }
      break;
    }
    for (const player of [ava, zion]) {
      await refresh(player);
      const s = player.state;
      if (s.me.hasWon) {
        if (alreadyWon === null) {
          const index = s.me.board.findIndex((cell, cellIndex) => !cell.free && ((s.me.marks >>> cellIndex) & 1) === 0);
          alreadyWon = (await post({ action: "mark", token: player.token, game: s.gameNumber, question: s.questionNumber, cell: index })).json?.result;
        }
        continue;
      }
      const answer = solve(s.question);
      const index = s.me.board.findIndex((cell, cellIndex) => !cell.free && ((s.me.marks >>> cellIndex) & 1) === 0 && answerMatches(settingsA, answer, cell));
      if (index >= 0) {
        const reply = await post({ action: "mark", token: player.token, game: s.gameNumber, question: s.questionNumber, cell: index });
        if (reply.json?.state?.me?.hasWon && !winnerOrder.includes(player)) {
          winnerOrder.push(player);
          // One win per player: the new winner tapping again is refused at once.
          if (alreadyWon === null) {
            const won = reply.json.state.me;
            const other = won.board.findIndex((cell, cellIndex) => !cell.free && ((won.marks >>> cellIndex) & 1) === 0);
            alreadyWon = (await post({ action: "mark", token: player.token, game: s.gameNumber, question: s.questionNumber, cell: other })).json?.result;
          }
        }
      }
    }
    view = await hostState();
    if (view.phase === "WINNER_REVEAL") {
      const other = students[5];
      await refresh(other);
      afterLimit = (await post({ action: "mark", token: other.token, game: view.gameNumber, question: view.questionNumber, cell: 0 })).json?.result;
      break;
    }
    if (view.phase === "QUESTION_ACTIVE") await host("next", { phase: "QUESTION_ACTIVE", question: view.questionNumber });
  }
  view = await hostState();
  ok(view.winners.length === 2 && view.winners[0].id && view.winners.map((winner) => winner.placement).join(",") === "1,2"
    && winnerOrder.length === 2 && winnerOrder.includes(ava) && winnerOrder.includes(zion), `winners in order with distinct places: ${view.winners.map((winner) => `${winner.placement}. ${winner.emoji ?? ""} ${winner.name}`).join(", ")}`);
  ok(alreadyWon === "already-won", `a winner cannot win or mark again (${alreadyWon})`);
  ok(view.phase === "WINNER_REVEAL" || view.phase === "GAME_COMPLETE", `the configured limit (2) ended the game (${view.phase})`);
  ok(afterLimit === "not-active", `after the limit, further marks are refused (${afterLimit})`);
  // One row per player; ranks never go backwards; equal players share a rank and say so (v1.2.38 ties); winners first.
  const ranks = view.leaderboard.map((row) => row.rank);
  const rankCounts = ranks.reduce((map, rank) => map.set(rank, (map.get(rank) ?? 0) + 1), new Map());
  ok(view.leaderboard.length === ids.length && ranks.every((rank, index) => index === 0 || rank >= ranks[index - 1])
    && view.leaderboard.every((row) => Boolean(row.tied) === (rankCounts.get(row.rank) > 1)) && view.leaderboard[0].won && view.leaderboard[1].won,
    `leaderboard: ${ids.length} players listed once, ranks in order (${rankCounts.size} distinct, ties shared), winners first`);
  await refresh(ava);
  const called = ava.state.called.map((item) => item.id);
  const orderless = ava.state.called.filter((item) => / \+ /.test(item.text)).map((item) => item.text.split(" + ").map(Number).sort((a, b) => a - b).join("+"));
  ok(called.length > 0 && new Set(called).size === called.length && new Set(orderless).size === orderless.length, `Called history: ${called.length} questions, all different (never both a + b and b + a)`);
  // Reconnect: a fresh state call restores the same card and emoji.
  const again = await post({ action: "state", token: ava.token });
  ok(again.status === 200 && JSON.stringify(again.json.state.me.board) === JSON.stringify(ava.state.me.board) && again.json.state.me.emoji === ava.emoji, "reconnect restores the same seat, card and emoji");

  // Rematch: Play Again deals new cards and a new deck.
  for (let wait = 0; wait < 20 && view.phase !== "GAME_COMPLETE"; wait += 1) { await sleep(1000); view = await hostState(); }
  const seedB = randomBytes(16).toString("hex");
  const gameB = buildGame(settingsA, seedB, view.players.map((player) => player.id));
  const rematch = await rpc("bingo_host_start", { p_owner_hash: ownerA, p_token_hash: tokenA, p_kind: "again", p_settings: settingsA, p_seed: seedB, p_pool: gameB.pool, p_deck: gameB.deck, p_boards: gameB.boards });
  await refresh(ava);
  ok(rematch.result === "started" && rematch.gameNumber === 2, "Play Again started game 2");
  ok(ava.state.gameNumber === 2 && ava.state.me.board && JSON.stringify(ava.state.me.board) !== JSON.stringify(again.json.state.me.board) && ava.state.called.length === 0 && !ava.state.me.hasWon,
    "rematch: a new card, a fresh Called history, wins cleared");
  for (const { engineName, errors } of phones) ok(errors.length === 0, `${engineName} phone page had no script errors (${errors.length})`);
  const closed = await host("close");
  const gone = await post({ action: "state", token: ava.token });
  // Closing deletes every seat (names and cards), so a seat token is simply unknown afterwards.
  ok(closed.status === "closed" && gone.status === 404 && gone.json?.error === "seat-not-found", `closing the room ends every seat (${gone.status} ${gone.json?.error})`);

  // ------------------------------------------------------------------ room B: Fraction Bingo
  const ownerB = hash(`bingo-production-qa-fractions-${randomBytes(16).toString("hex")}`);
  const tokenB = hash(randomBytes(32).toString("hex"));
  const settingsF = settingsFor({ mode: "fractions", level: "to-eighths", winners: 1 });
  const codeB = await freeCode();
  await rpc("bingo_create_room", { p_code: codeB, p_owner_hash: ownerB, p_host_token_hash: tokenB, p_settings: settingsF });
  rooms.push(tokenB);
  const fractionStudent = await post({ action: "join", code: codeB, name: "QA Frac", emoji: "\u{1F9E9}" });
  const viewF = await rpc("bingo_host_state", { p_owner_hash: ownerB, p_token_hash: tokenB, p_since_version: null, p_since_progress: null });
  const seedF = randomBytes(16).toString("hex");
  const gameF = buildGame(settingsF, seedF, viewF.players.map((player) => player.id));
  const startedF = await rpc("bingo_host_start", { p_owner_hash: ownerB, p_token_hash: tokenB, p_kind: "start", p_settings: settingsF, p_seed: seedF, p_pool: gameF.pool, p_deck: gameF.deck, p_boards: gameF.boards });
  let stateF = await rpc("bingo_host_command", { p_owner_hash: ownerB, p_token_hash: tokenB, p_command: "next", p_args: { phase: "COUNTDOWN", question: 0 } });
  for (let guard = 0; guard < 80 && stateF.phase !== "GAME_COMPLETE"; guard += 1) {
    stateF = await rpc("bingo_host_command", { p_owner_hash: ownerB, p_token_hash: tokenB, p_command: "next", p_args: { phase: stateF.phase, question: stateF.questionNumber } });
  }
  const seenF = await post({ action: "state", token: fractionStudent.json.token });
  const fractions = seenF.json.state.called.map((item) => item.text);
  ok(startedF.result === "started" && stateF.completedReason === "deck" && fractions.length === gameF.deck.length && new Set(fractions).size === fractions.length,
    `Fraction Bingo: every fraction called once (${fractions.length} questions, ${new Set(fractions).size} different), then "every question was called"`);
  await rpc("bingo_host_command", { p_owner_hash: ownerB, p_token_hash: tokenB, p_command: "close", p_args: {} });
} catch (error) {
  ok(false, `QA aborted: ${redact(error instanceof Error ? error.message : String(error))}`);
} finally {
  for (const browser of browsers) await browser.close().catch(() => {});
  for (const token of rooms) await admin.from("bingo_rooms").delete().eq("host_token_hash", token);
  let left = 0;
  for (const token of rooms) {
    const remaining = await admin.from("bingo_rooms").select("id", { count: "exact", head: true }).eq("host_token_hash", token);
    left += remaining.count ?? 0;
  }
  evidence.syntheticRoomsRemaining = left;
  console.log(`cleanup: ${rooms.length} synthetic room(s) deleted (participants cascade); ${left} remaining`);
}
const passed = results.filter(Boolean).length;
evidence.result = `${passed}/${results.length}`;
evidence.finishedAt = new Date().toISOString();
const out = resolve(process.env.RELEASE_EVIDENCE_DIR?.trim() || "qa-artifacts/math-bingo-live/production");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `bingo-production-qa-${Date.now()}.json`), redact(JSON.stringify(evidence, null, 2)));
console.log(`${passed}/${results.length} production QA checks passed`);
process.exit(passed === results.length && evidence.syntheticRoomsRemaining === 0 ? 0 : 1);
