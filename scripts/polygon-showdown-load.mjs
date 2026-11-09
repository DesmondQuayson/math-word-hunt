/**
 * Polygon Showdown load test: one room with N real HTTP players, all from one
 * address (a class behind one school connection), each actually playing through
 * the shared engine and syncing on the player page's cadence. Reports latency by
 * kind of request, refused or resynced moves, and whether every player's own
 * view of the game agrees exactly with the server's replay.
 *
 * Local:
 *   POLYGON_SHOWDOWN_URL=... SUPABASE_TEST_URL=... SUPABASE_TEST_SECRET_KEY=... \
 *     node scripts/polygon-showdown-load.mjs [--players 10,20,30,40,50] [--seconds 40] [--out file.json]
 *
 * Staging: scripts/invoke-polygon-showdown-staging.ps1 -Stage load -Origin <preview URL>
 * supplies STAGING_ORIGIN, the staging secret key, the database password and the
 * protection-bypass entry (confined to the preview origin; never printed, never
 * in a URL). Staging also samples a one-row Supabase read, the platform health
 * route, Postgres activity and per-function statement time, so a slow result can
 * be attributed to the application, Vercel, Supabase, polling, locks or network.
 *
 * Every room it creates is closed and deleted.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

import { minGapAfter, TIMING } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/economy.js";
import { allLegalMoves, applySwap, CONFIG, createKnownRefills, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard, stateHash } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const hostedOrigin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
const HOSTED = hostedOrigin !== "";
if (HOSTED && !/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(hostedOrigin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
for (const name of HOSTED ? Object.keys(process.env) : []) if (/_LIVE_|_PRODUCTION_|_READONLY_/.test(name)) throw new Error(`refusing: ${name} is present in this process`);

const ORIGIN = HOSTED ? hostedOrigin : process.env.POLYGON_SHOWDOWN_URL ?? "http://127.0.0.1:3102";
const PLAYER_COUNTS = option("players", "10,20,30,40,50").split(",").map(Number);
const SECONDS = Number(option("seconds", HOSTED ? "60" : "40"));
const OUT = option("out", null);
const JOIN_SPACING_MS = Number(option("join-spacing", HOSTED ? "150" : "12"));
const SYNC_MS = 1_200;
const LOBBY_POLL_MS = 1_500;
const MOVE_MS = 1_500;

const protection = HOSTED ? createProtectionBypass({ origin: ORIGIN, secret: (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim() }) : null;
const admin = createClient(
  HOSTED ? `https://${STAGING_PROJECT_REF}.supabase.co` : process.env.SUPABASE_TEST_URL,
  HOSTED ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_TEST_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const hashToken = (kind, token) => createHash("sha256").update(`polygon-showdown\n${kind}\n${token}`).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]);
};
const stats = (values) => ({ n: values.length, median: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Math.round(Math.max(...values)) : null });

const newBucket = () => ({ latencies: [], db: [], app: [], access: [], outside: [] });
const newMetrics = () => ({ join: newBucket(), lateJoin: newBucket(), lobby: newBucket(), submit: newBucket(), poll: newBucket(), reconnect: newBucket(), end: newBucket(), errors: {}, serverErrors: 0, databaseErrors: 0 });

function serverTiming(header) {
  const out = {};
  for (const part of (header ?? "").split(",")) {
    const name = part.split(";")[0]?.trim();
    const duration = part.match(/dur=([0-9.]+)/)?.[1];
    if (name && duration) out[name] = Number(duration);
  }
  return out;
}

async function post(action, fields, metrics, bucket) {
  const url = `${ORIGIN}/api/games/polygon-showdown/play`;
  const started = performance.now();
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { ...(protection ? protection.headersFor(url) : {}), "content-type": "application/json", "x-mathnexa-game": "polygon-showdown", "sec-fetch-site": "same-origin", origin: ORIGIN },
      body: JSON.stringify({ action, ...fields })
    });
  } catch (error) {
    if (metrics) metrics.errors[`network:${error?.cause?.code ?? "failed"}`] = (metrics.errors[`network:${error?.cause?.code ?? "failed"}`] ?? 0) + 1;
    return { status: 0, body: null };
  }
  const body = await response.json().catch(() => null);
  const elapsed = performance.now() - started;
  if (metrics && bucket) {
    const target = metrics[bucket];
    target.latencies.push(elapsed);
    const timing = serverTiming(response.headers.get("server-timing"));
    if (timing.db !== undefined) target.db.push(timing.db);
    if (timing.app !== undefined) {
      target.app.push(timing.app);
      target.outside.push(Math.max(0, elapsed - timing.app));
    }
    if (timing.access !== undefined) target.access.push(timing.access);
    if (!response.ok) {
      const key = `${response.status}:${body?.error ?? "unknown"}`;
      metrics.errors[key] = (metrics.errors[key] ?? 0) + 1;
      if (response.status >= 500) metrics.serverErrors += 1;
      if (body?.error === "live-unavailable") metrics.databaseErrors += 1;
    }
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
    this.startsAtMs = roomPayload.startsAtMs ?? null;
    this.resyncs = 0;
    this.rejected = [];
    this.stop = false;
    this.lobby = true;
    this.moveCount = 0;
    this.seed = index * 7919 + 13;
    this.offlineUntil = 0;
    this.wasOffline = false;
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

  async syncOnce(bucket) {
    const entries = this.pending.slice(0, TIMING.MAX_BATCH);
    const fields = entries.length ? { from: this.acked, moves: entries.map((entry) => entry.move), h: entries[entries.length - 1].hash } : {};
    const sent = performance.now();
    const reply = await post("state", { token: this.token, ...fields }, this.metrics, bucket ?? (entries.length ? "submit" : "poll"));
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

  async lobbyLoop() {
    await sleep(this.random() * LOBBY_POLL_MS);
    while (this.lobby) {
      await post("state", { token: this.token }, this.metrics, "lobby");
      await sleep(LOBBY_POLL_MS);
    }
  }

  async syncLoop() {
    await sleep(this.random() * SYNC_MS);
    while (!this.stop) {
      if (performance.now() < this.offlineUntil) {
        this.wasOffline = true;
        await sleep(150);
        continue;
      }
      await this.syncOnce(this.wasOffline ? "reconnect" : undefined);
      this.wasOffline = false;
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
      if (this.pending.length < TIMING.MAX_BATCH) this.playMove();
      await sleep(MOVE_MS * (0.7 + this.random() * 0.6));
    }
  }
}

// ------------------------------------------------- staging-only observation

const secrets = [];
let databaseUrl = null;
const cli = resolve("node_modules/supabase/dist/supabase.js");

function queryDatabase(url, statement) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [cli, "db", "query", "--db-url", url, "-o", "json", statement, "--yes"], { env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", () => done(null));
    child.on("close", (code) => {
      if (code !== 0) return done(null);
      try {
        const starts = [output.indexOf("["), output.indexOf("{")].filter((index) => index !== -1);
        const parsed = JSON.parse(output.slice(Math.min(...starts), Math.max(output.lastIndexOf("]"), output.lastIndexOf("}")) + 1));
        done(Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.result ?? parsed.data ?? []);
      } catch {
        done(null);
      }
    });
  });
}

async function connectDatabase() {
  if (!HOSTED || !process.env.SUPABASE_DB_PASSWORD) return;
  secrets.push(process.env.SUPABASE_DB_PASSWORD);
  for (const host of POOLER_HOSTS) {
    const url = `postgresql://postgres.${STAGING_PROJECT_REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@${host}:5432/postgres`;
    secrets.push(url);
    if (await queryDatabase(url, "select 1 as ok")) {
      databaseUrl = url;
      return;
    }
  }
}

const STATEMENT_FUNCTIONS = ["polygon_player_load", "polygon_player_commit", "polygon_join_room", "polygon_host_command"];
async function statementSnapshot() {
  if (!databaseUrl) return null;
  const rows = await queryDatabase(databaseUrl, `select f.name, coalesce(sum(s.calls), 0)::bigint as calls, coalesce(sum(s.total_exec_time), 0)::float as ms
    from unnest(array[${STATEMENT_FUNCTIONS.map((name) => `'${name}'`).join(",")}]) f(name)
    left join extensions.pg_stat_statements s on s.query ilike '%' || f.name || '%' and s.toplevel
    group by f.name`);
  return rows ? Object.fromEntries(rows.map((row) => [row.name, { calls: Number(row.calls), ms: Number(row.ms) }])) : null;
}

function statementDelta(before, after) {
  if (!before || !after) return null;
  return Object.fromEntries(STATEMENT_FUNCTIONS.map((name) => {
    const calls = after[name].calls - before[name].calls;
    const ms = after[name].ms - before[name].ms;
    return [name, { calls, meanExecMs: calls > 0 ? Number((ms / calls).toFixed(2)) : null }];
  }));
}

function startObservers(metricsRef) {
  if (!HOSTED) return async () => null;
  const observed = { supabaseOneRow: [], supabaseErrors: 0, platformHealth: [], active: [], total: [], lockWaits: [] };
  let running = true;
  const supabaseProbe = (async () => {
    while (running) {
      const started = performance.now();
      const { error } = await admin.from("game_catalog_entries").select("stable_key").limit(1);
      if (error) observed.supabaseErrors += 1;
      else observed.supabaseOneRow.push(performance.now() - started);
      await sleep(1000);
    }
  })();
  const healthProbe = (async () => {
    const url = `${ORIGIN}/api/health`;
    while (running) {
      const started = performance.now();
      const response = await fetch(url, { headers: protection.headersFor(url), redirect: "manual" }).catch(() => null);
      if (response?.ok) observed.platformHealth.push(performance.now() - started);
      await response?.arrayBuffer().catch(() => null);
      await sleep(1000);
    }
  })();
  const activity = (async () => {
    while (running && databaseUrl) {
      const rows = await queryDatabase(databaseUrl, `select count(*) filter (where state = 'active')::int as active, count(*)::int as total, count(*) filter (where wait_event_type = 'Lock')::int as lock_waits from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`);
      if (rows?.[0]) {
        observed.active.push(rows[0].active);
        observed.total.push(rows[0].total);
        observed.lockWaits.push(rows[0].lock_waits);
      }
      await sleep(5000);
    }
  })();
  void metricsRef;
  return async () => {
    running = false;
    await Promise.all([supabaseProbe, healthProbe, activity]);
    return {
      supabaseOneRowRead: stats(observed.supabaseOneRow),
      supabaseProbeErrors: observed.supabaseErrors,
      platformHealthRoute: stats(observed.platformHealth),
      postgres: observed.active.length ? { samples: observed.active.length, maxActive: Math.max(...observed.active), maxConnections: Math.max(...observed.total), maxLockWaits: Math.max(...observed.lockWaits) } : null
    };
  };
}

// ----------------------------------------------------------------- one cohort

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
  const roomId = created.data.id;

  const metrics = newMetrics();
  try {
    const firstSeat = await post("state", { token: creatorToken }, null, null);
    if (firstSeat.status !== 200) throw new Error(`Creator seat refused: ${firstSeat.status} ${JSON.stringify(firstSeat.body)}`);
    const players = [new Player(0, creatorToken, firstSeat.body.room, metrics)];
    const late = Math.max(1, Math.round(count * 0.1));
    const before = await statementSnapshot();
    const observers = startObservers(metrics);

    // Everyone arrives over a few seconds and waits in the lobby, polling as the page does.
    const lobbyLoops = [players[0].lobbyLoop()];
    await Promise.all(Array.from({ length: count - 1 - late }, async (_, index) => {
      await sleep(index * JOIN_SPACING_MS);
      const join = await post("join", { code, name: `Player ${index + 1}`, emoji: null }, metrics, "join");
      if (join.status !== 200) throw new Error(`Join refused: ${join.status} ${JSON.stringify(join.body)}`);
      const player = new Player(index + 1, join.body.token, join.body.room, metrics);
      players.push(player);
      lobbyLoops.push(player.lobbyLoop());
    }));

    await sleep(1500);
    const started = await admin.rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: "start", p_args: {} });
    if (started.error) throw started.error;
    const startsAt = started.data.startsAtMs;
    for (const player of players) {
      player.lobby = false;
      player.startsAtMs = startsAt;
    }
    await Promise.all(lobbyLoops);
    await sleep(Math.max(0, startsAt - players[0].serverNow()) + 80);

    const until = performance.now() + SECONDS * 1000;
    const syncs = players.map((player) => player.syncLoop());
    const moves = players.map((player) => player.moveLoop(until));

    // Late arrivals, a third of the way through.
    await sleep(SECONDS * 300);
    await Promise.all(Array.from({ length: late }, async (_, index) => {
      await sleep(index * 300);
      const join = await post("join", { code, name: `Late ${index + 1}`, emoji: null }, metrics, "lateJoin");
      if (join.status !== 200) throw new Error(`Late join refused: ${join.status} ${JSON.stringify(join.body)}`);
      const player = new Player(players.length, join.body.token, join.body.room, metrics);
      player.lobby = false;
      player.startsAtMs = startsAt;
      players.push(player);
      syncs.push(player.syncLoop());
      moves.push(player.moveLoop(until));
    }));

    // Halfway: one in five loses the connection for about eight seconds.
    await sleep(Math.max(0, SECONDS * 200));
    const dropped = players.filter((_, index) => index % 5 === 2);
    for (const player of dropped) player.offlineUntil = performance.now() + 6000 + player.random() * 4000;

    await Promise.all(moves);
    for (const player of players) player.stop = true;
    await Promise.all(syncs);
    // Everyone's last moves reach the server.
    for (let round = 0; round < 4; round += 1) {
      await Promise.all(players.filter((player) => player.pending.length).map((player) => player.syncOnce()));
    }

    await admin.rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: "end", p_args: {} });
    const endedAt = performance.now();
    await sleep(TIMING.SHOWDOWN_GRACE_MS + 300);
    await Promise.all(players.map((player) => post("state", { token: player.token }, metrics, "end")));
    let finalRoom = null;
    let finalizedAfterMs = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const reply = await post("state", { token: creatorToken }, metrics, "end");
      finalRoom = reply.body?.room ?? finalRoom;
      if (finalRoom?.finalized) {
        finalizedAfterMs = Math.round(performance.now() - endedAt);
        break;
      }
      await sleep(250);
    }
    const observed = await observers();
    const after = await statementSnapshot();

    const mismatches = players.filter((player) => player.serverState && player.state.moves === player.serverState.moves && (player.state.coins !== player.serverState.coins || player.state.board !== player.serverState.board)).length;
    const unsynced = players.filter((player) => player.pending.length > 0).length;
    const rows = finalRoom?.standings?.rows ?? [];
    const sorted = rows.every((row, index) => index === 0 || rows[index - 1].coins >= row.coins);
    const coinsById = new Map(rows.map((row) => [row.id, row.coins]));
    const scoreMismatch = players.filter((player) => coinsById.get(player.id) !== player.state.coins).length;
    const api = [...metrics.submit.latencies, ...metrics.poll.latencies];
    const breakdown = (bucket) => ({ ...stats(bucket.latencies), serverDbP95: percentile(bucket.db, 0.95), serverAppP95: percentile(bucket.app, 0.95), outsideP95: percentile(bucket.outside, 0.95) });

    return {
      players: count,
      seconds: SECONDS,
      requestsPerSecond: Math.round(api.length / SECONDS),
      api: stats(api),
      join: breakdown(metrics.join),
      lateJoin: breakdown(metrics.lateJoin),
      lobbyPoll: breakdown(metrics.lobby),
      scoreSubmission: breakdown(metrics.submit),
      leaderboardAndRoomPoll: breakdown(metrics.poll),
      reconnect: breakdown(metrics.reconnect),
      endGame: { ...breakdown(metrics.end), finalizedAfterMs },
      serverErrors: metrics.serverErrors,
      databaseErrors: metrics.databaseErrors,
      errors: metrics.errors,
      moves: players.reduce((sum, player) => sum + player.moveCount, 0),
      resyncs: players.reduce((sum, player) => sum + player.resyncs, 0),
      rejected: [...new Set(players.flatMap((player) => player.rejected))],
      mismatches,
      unsynced,
      scoreMismatch,
      standingsSorted: sorted,
      standingsRows: rows.length,
      finalized: finalRoom?.finalized === true,
      observed,
      statements: statementDelta(before, after)
    };
  } finally {
    await admin.rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: "close", p_args: {} });
    await admin.from("polygon_rooms").delete().eq("id", roomId);
  }
}

await connectDatabase();
const results = [];
if (HOSTED) {
  // Warm the functions so the first cohort is not measuring a cold start.
  const url = `${ORIGIN}/api/health`;
  for (let round = 0; round < 4; round += 1) await fetch(url, { headers: protection.headersFor(url), redirect: "manual" }).then((response) => response.arrayBuffer()).catch(() => null);
  await post("state", { token: newToken() }, null, null);
}
for (const count of PLAYER_COUNTS) {
  const outcome = await runRoom(count);
  results.push(outcome);
  console.log(secrets.reduce((text, secret) => (secret ? text.split(secret).join("[redacted]") : text), JSON.stringify(outcome)));
  await sleep(HOSTED ? 8000 : 1500);
}
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
const failed = results.some((row) => Object.keys(row.errors).length || row.mismatches || row.scoreMismatch || row.unsynced || !row.standingsSorted || !row.finalized);
process.exitCode = failed ? 1 : 0;
