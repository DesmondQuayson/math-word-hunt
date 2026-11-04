/**
 * Math Bingo Live — deterministic classroom simulation (host + 40 students).
 *
 * Drives the REAL database functions (local Supabase, service role, exactly as
 * the application server calls them) with the REAL engine (pool, deck, cards)
 * and 40 seeded student behaviours: accuracy, missed questions, wrong taps,
 * Free Space timing, and a host who paces the game manually. After every step
 * it checks the invariants that matter, then plays a rematch, and finally
 * replays the whole simulation to prove it is deterministic.
 *
 *   node scripts/math-bingo-live-simulation.mjs [--students 40] [--winners 5] [--mode addition --level facts-20]
 *
 * Local-only: refuses any non-loopback Supabase. Every room it creates is
 * closed (participants deleted) at the end.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const engine = "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/";
const { createRandom } = await import(`${engine}random.js`);
const { DEFAULT_SETTINGS, normalizeSettings } = await import(`${engine}settings.js`);
const { buildAnswerPool, buildDeck, answerMatches } = await import(`${engine}questions.js`);
const { dealCard, enabledLines, completedLines, popcount, CENTER } = await import(`${engine}board.js`);

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const STUDENTS = Number(argument("students", 40));
const WINNERS = Number(argument("winners", 5));
const MODE = argument("mode", "addition");
const LEVEL = argument("level", "facts-20");
const SEED_TEXT = argument("seed", "mathnexa-bingo-simulation-2026-11-04");

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL)) throw new Error("The simulation is local-only.");
const db = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const hex = (text, length) => createHash("sha256").update(text).digest("hex").slice(0, length);

async function rpc(fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

function check(condition, message) {
  if (!condition) throw new Error(`INVARIANT FAILED: ${message}`);
}

async function simulate(runLabel) {
  const settingsResult = normalizeSettings({ ...DEFAULT_SETTINGS, mode: MODE, level: LEVEL, questionSeconds: 0, revealSeconds: 0, winners: WINNERS });
  check(settingsResult.ok, "settings");
  const settings = settingsResult.settings;
  const random = createRandom(`${SEED_TEXT}:behaviour`);
  const owner = hex(`${SEED_TEXT}:${runLabel}:owner`, 64);
  const hostToken = hex(`${SEED_TEXT}:${runLabel}:host:${Date.now()}`, 64);
  const code = String(100000 + (Number.parseInt(hex(`${runLabel}:${Date.now()}`, 8), 16) % 899999));
  const created = await rpc("bingo_create_room", { p_code: code, p_owner_hash: owner, p_host_token_hash: hostToken, p_settings: settings });
  check(created.result === "created", `room created (${created.result})`);
  const host = { p_owner_hash: owner, p_token_hash: hostToken };

  const students = [];
  for (let index = 0; index < STUDENTS; index += 1) {
    const name = `Student ${String(index + 1).padStart(2, "0")}`;
    const token = hex(`${SEED_TEXT}:${runLabel}:student:${index}:${Date.now()}`, 64);
    const joined = await rpc("bingo_join_room", { p_code: code, p_name: name, p_token_hash: token, p_subject_hash: hex(`${runLabel}:subject`, 64) });
    check(joined.result === "joined", `${name} joined (${joined.result})`);
    students.push({
      name, token,
      accuracy: 0.55 + random.next() * 0.4,
      missRate: random.next() * 0.25,
      freeAt: 1 + random.int(0, 14),
      markedAt: new Map()
    });
  }
  const lobby = await rpc("bingo_host_state", { ...host, p_since_version: null });
  check(lobby.players.length === STUDENTS, "every student is in the lobby");
  check(new Set(lobby.players.map(player => player.name)).size === STUDENTS, "no duplicate players");

  async function startGame(kind, gameSeed) {
    const pool = buildAnswerPool(settings, gameSeed);
    const deck = buildDeck(settings, pool, gameSeed).map(question => ({ t: question.text, s: question.spoken, k: question.kind, n: question.answer.n, d: question.answer.d }));
    const started = await rpc("bingo_host_start", { ...host, p_kind: kind, p_settings: settings, p_seed: gameSeed, p_pool: pool, p_deck: deck });
    check(started.result === "started", `${kind} started (${started.result})`);
    for (const student of students) {
      // Deal by name (not the random row id) so a replay deals identical cards.
      const card = dealCard({ pool, seed: gameSeed, participantId: student.name, freeSpace: true, fractions: settings.mode === "fractions" });
      const stored = await rpc("bingo_set_board", { p_token_hash: student.token, p_game: started.gameNumber, p_board: card });
      check(stored.result === "ok", `${student.name} card stored (${stored.result})`);
      student.card = card;
      student.markedAt = new Map();
    }
    const cards = new Set(students.map(student => student.card.map(cell => (cell.free ? "F" : `${cell.n}/${cell.d}`)).join(",")));
    const pools = new Set(students.map(student => student.card.filter(cell => !cell.free).map(cell => `${cell.n}/${cell.d}`).sort().join(",")));
    check(pools.size === 1, "every card is the same answer multiset");
    check(cards.size === STUDENTS, "every card is a different arrangement");
    return { gameNumber: started.gameNumber, deck };
  }

  async function verify(state, deck, label) {
    const room = await rpc("bingo_host_state", { ...host, p_since_version: null });
    const winners = room.winners;
    check(winners.length === room.winnerCount, `${label}: winner list matches the count`);
    check(winners.length <= WINNERS, `${label}: never more than ${WINNERS} winners`);
    check(winners.every((winner, index) => winner.placement === index + 1), `${label}: placements are 1..n in order`);
    check(new Set(winners.map(winner => winner.id)).size === winners.length, `${label}: one placement per player`);
    for (const student of students) {
      const view = await rpc("bingo_player_state", { p_token_hash: student.token, p_since_version: null, p_since_me: null });
      const me = view.me;
      const lines = completedLines(me.marks, settings.patterns);
      if (me.hasWon) {
        check(lines.length > 0, `${label}: ${student.name} won with a complete enabled line`);
        check(winners.some(winner => winner.name === student.name && winner.placement === me.placement), `${label}: ${student.name} placement recorded`);
      } else if (lines.length > 0) {
        check(winners.length >= WINNERS, `${label}: ${student.name} has a line but no placement only once the winners are full`);
      }
      check(me.freeUsed === (((me.marks >>> CENTER) & 1) === 1), `${label}: ${student.name} Free Space bit matches`);
      check(me.correct === popcount(me.marks) - (me.freeUsed ? 1 : 0), `${label}: ${student.name} one mark per correct answer`);
      for (const [cell, questionNumber] of student.markedAt) {
        check(answerMatches(settings, deck[questionNumber - 1], me.board[cell]), `${label}: ${student.name} cell ${cell} matches question ${questionNumber}`);
      }
      const expectedBest = Math.max(0, ...enabledLines(settings.patterns).map(line => popcount(me.marks & line.mask)));
      check(me.best === expectedBest, `${label}: ${student.name} best-line progress ${me.best} = ${expectedBest}`);
    }
    // Leaderboard: winners first by placement, then best line, then correct marks.
    const board = room.leaderboard;
    for (let index = 1; index < board.length; index += 1) {
      const [a, b] = [board[index - 1], board[index]];
      const ordered = (a.won && !b.won) || (a.won && b.won && a.placement < b.placement)
        || (!a.won && !b.won && (a.best > b.best || (a.best === b.best && a.correct >= b.correct)));
      check(ordered, `${label}: leaderboard order at ${index}`);
    }
    return room;
  }

  async function playGame(kind, gameSeed) {
    const { deck } = await startGame(kind, gameSeed);
    const timeline = [];
    let room = await rpc("bingo_host_command", { ...host, p_command: "next", p_args: { phase: "COUNTDOWN", question: 0 } });
    while (room.phase === "QUESTION_ACTIVE") {
      const questionNumber = room.questionNumber;
      const answer = deck[questionNumber - 1];
      for (const student of students) {
        const view = await rpc("bingo_player_state", { p_token_hash: student.token, p_since_version: null, p_since_me: null });
        if (view.phase !== "QUESTION_ACTIVE") break;
        const me = view.me;
        if (me.hasWon) {
          const again = await rpc("bingo_mark", { p_token_hash: student.token, p_game: view.gameNumber, p_question: questionNumber, p_cell: 0 });
          check(again.result === "already-won", `${student.name} cannot mark after winning (${again.result})`);
          continue;
        }
        if (!me.freeUsed && questionNumber >= student.freeAt) {
          const free = await rpc("bingo_free_space", { p_token_hash: student.token, p_game: view.gameNumber, p_question: questionNumber });
          check(["free-space", "not-active"].includes(free.result), `${student.name} Free Space (${free.result})`);
          if (free.result === "free-space") timeline.push(`q${questionNumber}:free:${student.name}`);
          if (free.me?.hasWon) timeline.push(`q${questionNumber}:bingo:${student.name}:${free.me.placement}`);
          if (free.phase !== "QUESTION_ACTIVE") break;
          if (free.me?.hasWon) continue;
        }
        if (random.next() < student.missRate) continue;
        const open = student.card.map((cell, index) => index).filter(index => ((me.marks >>> index) & 1) === 0 && !student.card[index].free);
        const right = open.filter(index => answerMatches(settings, answer, student.card[index]));
        const wrong = open.filter(index => !answerMatches(settings, answer, student.card[index]));
        if (random.next() > student.accuracy && wrong.length) {
          const tap = await rpc("bingo_mark", { p_token_hash: student.token, p_game: view.gameNumber, p_question: questionNumber, p_cell: random.pick(wrong) });
          check(tap.result === "incorrect", `${student.name} wrong tap is refused (${tap.result})`);
          continue;
        }
        if (!right.length) continue;
        // Strategy: the matching cell that helps the best line most.
        let choice = right[0];
        let score = -1;
        for (const index of right) {
          const next = me.marks | (1 << index);
          const value = Math.max(...enabledLines(settings.patterns).map(line => popcount(next & line.mask)));
          if (value > score) [choice, score] = [index, value];
        }
        const marked = await rpc("bingo_mark", { p_token_hash: student.token, p_game: view.gameNumber, p_question: questionNumber, p_cell: choice });
        check(["correct", "not-active"].includes(marked.result), `${student.name} correct mark (${marked.result})`);
        if (marked.result === "correct") {
          student.markedAt.set(choice, questionNumber);
          // A second mark on the same question is always refused.
          const second = right.find(index => index !== choice);
          if (second !== undefined && marked.phase === "QUESTION_ACTIVE") {
            const twice = await rpc("bingo_mark", { p_token_hash: student.token, p_game: view.gameNumber, p_question: questionNumber, p_cell: second });
            check(["mark-used", "already-won"].includes(twice.result), `${student.name} one normal mark per question (${twice.result})`);
          }
          if (marked.me.hasWon) timeline.push(`q${questionNumber}:bingo:${student.name}:${marked.me.placement}`);
        }
        if (marked.phase !== "QUESTION_ACTIVE") break;
      }
      room = await verify(room, deck, `game ${kind} q${questionNumber}`);
      if (room.phase !== "QUESTION_ACTIVE") break;
      room = await rpc("bingo_host_command", { ...host, p_command: "next", p_args: { phase: "QUESTION_ACTIVE", question: questionNumber } });
      check(room.phase === "ANSWER_REVEAL", "reveal follows the question");
      room = await rpc("bingo_host_command", { ...host, p_command: "next", p_args: { phase: "ANSWER_REVEAL", question: questionNumber } });
    }
    const final = await rpc("bingo_host_state", { ...host, p_since_version: null });
    check(final.phase === "WINNER_REVEAL" || final.phase === "GAME_COMPLETE", `game ends (${final.phase})`);
    check(final.winnerCount === WINNERS, `exactly ${WINNERS} winners (${final.winnerCount})`);
    const lastQuestion = final.questionNumber;
    const extra = await rpc("bingo_host_command", { ...host, p_command: "next", p_args: { phase: final.phase, question: lastQuestion } });
    check(extra.result === "stale" && extra.questionNumber === lastQuestion, "no question after the final winner");
    return { winners: final.winners.map(winner => `${winner.placement}:${winner.name}:${winner.line}`), lastQuestion, timeline };
  }

  const game1 = await playGame("start", hex(`${SEED_TEXT}:game1`, 32));
  await rpc("bingo_host_command", { ...host, p_command: "end", p_args: {} });
  const game2 = await playGame("again", hex(`${SEED_TEXT}:game2`, 32));
  const roster = await rpc("bingo_host_state", { ...host, p_since_version: null });
  check(roster.players.length === STUDENTS, "the rematch kept the roster");
  await rpc("bingo_host_command", { ...host, p_command: "close", p_args: {} });
  const gone = await rpc("bingo_player_state", { p_token_hash: students[0].token, p_since_version: null, p_since_me: null });
  check(gone.result === "not-found", "closing deleted the participants");
  return { game1, game2 };
}

const started = Date.now();
const first = await simulate("run-a");
const second = await simulate("run-b");
const same = JSON.stringify(first) === JSON.stringify(second);
console.log(JSON.stringify({
  students: STUDENTS, winners: WINNERS, mode: MODE, level: LEVEL,
  game1: { winners: first.game1.winners, endedAtQuestion: first.game1.lastQuestion, freeSpaces: first.game1.timeline.filter(item => item.includes(":free:")).length },
  game2: { winners: first.game2.winners, endedAtQuestion: first.game2.lastQuestion },
  deterministicReplay: same,
  seconds: Math.round((Date.now() - started) / 1000)
}, null, 2));
if (!same) throw new Error("INVARIANT FAILED: the replay was not identical");
console.log("SIMULATION PASSED: every invariant held after every question, in two games and an identical replay.");
