/**
 * Polygon Showdown load test: one room with N real HTTP players, all from one
 * address (a class behind one school connection), each actually playing through
 * the shared engine and syncing on the player page's cadence. Reports request
 * latency, refused or resynced moves, and whether every player's own view of
 * the game agrees exactly with the server's replay.
 *
 *   POLYGON_SHOWDOWN_URL=... SUPABASE_TEST_URL=... SUPABASE_TEST_SECRET_KEY=... \
 *     node scripts/polygon-showdown-load.mjs [--players 10,20,30,40,50] [--seconds 40] [--out file.json]
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { minGapAfter, TIMING } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/economy.js";
import { allLegalMoves, applySwap, CONFIG, createKnownRefills, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard, stateHash } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const ORIGIN = process.env.POLYGON_SHOWDOWN_URL ?? "http://127.0.0.1:3102";
const PLAYER_COUNTS = option("players", "10,20,30,40,50").split(",").map(Number);
const SECONDS = Number(option("seconds", "40"));
const OUT = option("out", null);
const SYNC_MS = 1_200;
const MOVE_MS = 1_500;

const admin = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const hashToken = (kind, token) => createHash("sha256").update(`polygon-showdown\n${kind}\n${token}`).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]);
};

async function post(action, fields, metrics) {
  const started = performance.now();
  const response = await fetch(`${ORIGIN}/api/games/polygon-showdown/play`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mathnexa-game": "polygon-showdown", "sec-fetch-site": "same-origin", origin: ORIGIN },
    body: JSON.stringify({ action, ...fields })
  });
  const body = await response.json().catch(() => null);
  const elapsed = performance.now() - started;
  if (metrics) {
    metrics.latencies.push(elapsed);
    if (!response.ok) metrics.errors[response.status] = (metrics.errors[response.status] ?? 0) + 1;
  }
  return { status: response.status, body };
}

class Player {
  constructor(index, token, roomPayload, metrics) {
    this.index = index;
    this.token = token;
    this.metrics = metrics;
    this.room = roomPayload;
    const me = roomPayload.me;
    this.name = me.name;
    this.id = me.id;
    this.state = me.state;
    this.acked = me.state.moves;
    this.pending = [];
    this.nextT = me.nextT;
    this.known = createKnownRefills();
    this.known.merge(me.state.cursors, me.windows);
    this.offset = roomPayload.nowMs - performance.now();
    this.startsAtMs = null;
    this.resyncs = 0;
    this.rejected = [];
    this.stop = false;
    this.moveCount = 0;
    this.seed = index * 7919 + 13;
  }

  serverNow() {
    return performance.now() + this.offset;
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  applyReply(reply) {
    if (reply.status !== 200 || !reply.body?.room) return;
    const room = reply.body.room;
    this.room = room;
    this.startsAtMs = room.startsAtMs;
    const me = room.me;
    if (reply.body.resync) {
      this.resyncs += 1;
      if (reply.body.rejected) this.rejected.push(reply.body.rejected);
      this.state = me.state;
      this.pending = [];
      this.acked = me.state.moves;
      this.nextT = me.nextT;
      this.known.merge(me.state.cursors, me.windows);
      return;
    }
    const applied = me.state.moves - this.acked;
    if (applied > 0) {
      this.pending.splice(0, applied);
      this.acked = me.state.moves;
    }
    this.serverState = me.state;
    this.known.merge(me.state.cursors, me.windows);
  }

  async syncOnce() {
    const entries = this.pending.slice(0, TIMING.MAX_BATCH);
    const fields = entries.length ? { from: this.acked, moves: entries.map((entry) => entry.move), h: entries[entries.length - 1].hash } : {};
    const sent = performance.now();
    const reply = await post("state", { token: this.token, ...fields }, this.metrics);
    const received = performance.now();
    if (reply.body?.room?.nowMs) {
      const estimate = reply.body.room.nowMs + (received - sent) / 2 - received;
      if (received - sent < (this.bestRtt ?? Infinity)) {
        this.bestRtt = received - sent;
        this.offset = estimate;
      }
    }
    this.applyReply(reply);
    return reply;
  }

  async syncLoop() {
    await sleep(this.random() * SYNC_MS);
    while (!this.stop) {
      await this.syncOnce();
      await sleep(SYNC_MS + this.random() * 200);
    }
  }

  playMove() {
    const nowT = this.serverNow() - this.startsAtMs;
    if (nowT < 0) return;
    const moves = allLegalMoves(decodeBoard(this.state.board), 8, 8);
    if (moves.length === 0) return;
    const [a, b] = moves[Math.floor(this.random() * moves.length)];
    const t = Math.max(Math.round(nowT), this.nextT);
    const result = applySwap(this.state, a, b, this.known.at, CONFIG, t);
    if (!result.ok) return;
    this.nextT = t + minGapAfter(result.chain);
    this.pending.push({ move: [a, b, t], hash: stateHash(result.state) });
    this.state = result.state;
    this.known.trim(this.state.cursors);
    this.moveCount += 1;
  }

  async moveLoop(until) {
    await sleep(this.random() * MOVE_MS);
    while (performance.now() < until) {
      this.playMove();
      await sleep(MOVE_MS * (0.7 + this.random() * 0.6));
    }
  }
}

async function runRoom(count) {
  const seed = randomBytes(16).toString("hex");
  const opening = newGameState(encodeBoard(startingBoard(seed)), CONFIG, SCHEDULES.standard);
  const code = String(100000 + Math.floor(Math.random() * 899999));
  const ownerHash = createHash("sha256").update(`load-owner-${seed}`).digest("hex");
  const hostToken = newToken();
  const creatorToken = newToken();
  const created = await admin.rpc("polygon_create_room", {
    p_code: code, p_owner_hash: ownerHash, p_host_token_hash: hashToken("host", hostToken), p_player_token_hash: hashToken("player", creatorToken),
    p_user: null, p_name: "Creator", p_emoji: "🦁", p_duration: 300, p_seed: seed, p_state: opening
  });
  if (created.error || !created.data?.id) throw new Error(`Room not created: ${created.error?.message ?? JSON.stringify(created.data)}`);

  const metrics = { latencies: [], errors: {} };
  const firstSeat = await post("state", { token: creatorToken }, null);
  const players = [new Player(0, creatorToken, firstSeat.body.room, metrics)];
  const joinTimes = [];
  await Promise.all(Array.from({ length: count - 1 }, async (_, index) => {
    await sleep(index * 12);
    const started = performance.now();
    const join = await post("join", { code, name: `Player ${index + 1}`, emoji: null }, null);
    joinTimes.push(performance.now() - started);
    if (join.status !== 200) throw new Error(`Join refused: ${join.status} ${JSON.stringify(join.body)}`);
    players.push(new Player(index + 1, join.body.token, join.body.room, metrics));
  }));

  const started = await admin.rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: "start", p_args: {} });
  if (started.error) throw started.error;
  const startsAt = started.data.startsAtMs;
  for (const player of players) player.startsAtMs = startsAt;
  await sleep(Math.max(0, startsAt - players[0].serverNow()) + 80);

  metrics.latencies.length = 0;
  const until = performance.now() + SECONDS * 1000;
  const syncs = players.map((player) => player.syncLoop());
  await Promise.all(players.map((player) => player.moveLoop(until)));
  for (const player of players) player.stop = true;
  await Promise.all(syncs);
  // Everyone's last moves reach the server.
  for (let round = 0; round < 4; round += 1) {
    await Promise.all(players.filter((player) => player.pending.length).map((player) => player.syncOnce()));
  }

  const latencies = metrics.latencies.slice();
  await admin.rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: "end", p_args: {} });
  await sleep(TIMING.SHOWDOWN_GRACE_MS + 300);
  await post("state", { token: creatorToken }, null);
  await sleep(200);
  const finalRoom = (await post("state", { token: creatorToken }, null)).body.room;

  const mismatches = players.filter((player) => player.serverState && player.state.moves === player.serverState.moves && (player.state.coins !== player.serverState.coins || player.state.board !== player.serverState.board)).length;
  const unsynced = players.filter((player) => player.pending.length > 0).length;
  const rows = finalRoom.standings.rows;
  const sorted = rows.every((row, index) => index === 0 || rows[index - 1].coins >= row.coins);
  const coinsById = new Map(rows.map((row) => [row.id, row.coins]));
  const scoreMismatch = players.filter((player) => coinsById.get(player.id) !== player.state.coins).length;

  await admin.rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: "close", p_args: {} });

  return {
    players: count,
    seconds: SECONDS,
    requests: latencies.length,
    requestsPerSecond: Math.round(latencies.length / SECONDS),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: percentile(latencies, 1),
    joinP95: percentile(joinTimes, 0.95),
    errors: metrics.errors,
    moves: players.reduce((sum, player) => sum + player.moveCount, 0),
    resyncs: players.reduce((sum, player) => sum + player.resyncs, 0),
    rejected: [...new Set(players.flatMap((player) => player.rejected))],
    mismatches,
    unsynced,
    scoreMismatch,
    standingsSorted: sorted,
    standingsRows: rows.length,
    finalized: finalRoom.finalized
  };
}

const results = [];
for (const count of PLAYER_COUNTS) {
  const outcome = await runRoom(count);
  results.push(outcome);
  console.log(JSON.stringify(outcome));
  await sleep(1500);
}
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
const failed = results.some((row) => Object.keys(row.errors).length || row.mismatches || row.scoreMismatch || row.unsynced || !row.standingsSorted || !row.finalized);
process.exitCode = failed ? 1 : 0;
