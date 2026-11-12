/**
 * Math Race Champions — Online Race load test.
 *
 * Runs whole races with 10, 20, 30, 40 and 50 racers against a running local
 * review server and reports what was measured: join, poll and answer latency
 * (median / p95 / max, and the server's own database share), errors, reconnects,
 * the size of a poll reply, and whether the final order agrees with the finish
 * times. Every racer plays over the same HTTP API a browser uses and works each
 * answer out from the question it is shown; nobody is given an answer.
 *
 *   node scripts/run-math-race-champions.mjs load [--players 10,20,30,40,50] [--think 2500] [--accuracy 0.9] [--out file.json]
 *
 * Local Supabase only. Numbers from `next dev` on one machine are a floor for
 * what the code costs, not a forecast for hosted infrastructure.
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { MIN_CORRECT, newRacerState } from "../apps/platform-web/public/internal-games/math-race-champions/src/engine/race.js";
import { HttpRacer } from "./math-race-champions-racer.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const ORIGIN = (process.env.MATH_RACE_CHAMPIONS_URL ?? "http://127.0.0.1:3103").replace(/\/$/, "");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(ORIGIN)) throw new Error("The load test is local-only.");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.SUPABASE_TEST_URL ?? "")) throw new Error("The load test needs local Supabase (SUPABASE_TEST_URL).");

const PLAYER_COUNTS = String(option("players", "10,20,30,40,50")).split(",").map(Number).filter(count => count >= 2 && count <= 60);
const THINK_MS = Number(option("think", "2500"));
const ACCURACY = Number(option("accuracy", "0.9"));
const OUT = option("out", null);
const JOIN_SPACING_MS = 15;
const COLOURS = ["turquoise", "pink", "gold", "green", "red", "purple", "orange", "white"];

const admin = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const hashToken = (kind, token) => createHash("sha256").update(`math-race-champions\n${kind}\n${token}`).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const sleep = ms => new Promise(done => setTimeout(done, ms));
const percentile = (values, fraction) => (values.length ? Math.round([...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))]) : null);
const summary = values => ({ n: values.length, median: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Math.round(Math.max(...values)) : null });

async function rpc(name, params) {
  const { data, error } = await admin.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function oneRace(players) {
  const samples = { join: [], state: [], answer: [] };
  const database = { join: [], state: [], answer: [] };
  const errors = {};
  const onSample = ({ kind, ms, status, timing }) => {
    samples[kind]?.push(ms);
    if (timing.db !== undefined) database[kind]?.push(timing.db);
    if (status !== 200) errors[`${kind}:${status}`] = (errors[`${kind}:${status}`] ?? 0) + 1;
  };

  // The creator's room, made the way the account API makes it. The creator is racer 1.
  const owner = hashToken("host", `load-owner-${players}-${Date.now()}`);
  const hostToken = newToken();
  const creatorToken = newToken();
  let code = "";
  let created = null;
  for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
    code = String(100000 + Math.floor(Math.random() * 900000));
    const reply = await rpc("race_create_room", {
      p_code: code, p_owner_hash: owner, p_host_token_hash: hashToken("host", hostToken), p_player_token_hash: hashToken("player", creatorToken),
      p_user: null, p_name: "Racer 1", p_emoji: null, p_colour: "gold",
      p_settings: { categories: ["missing-addend", "missing-subtrahend", "missing-multiplier", "missing-divisor", "percent-to-decimal", "decimal-to-percent", "powers"], difficulty: "easy" },
      p_seed: randomBytes(16).toString("hex"), p_state: newRacerState()
    });
    if (reply.result === "created") created = reply;
  }
  if (!created) throw new Error("Could not create a room.");

  const racers = [new HttpRacer(ORIGIN, { name: "Racer 1", colour: "gold", thinkMs: THINK_MS, accuracy: ACCURACY, onSample })];
  racers[0].token = creatorToken;
  await racers[0].poll();

  // Everyone else joins with the code, as a guest.
  const joinStarted = performance.now();
  const joins = [];
  for (let index = 2; index <= players; index += 1) {
    // A spread of speeds and accuracies, like a class: 0.7x to 1.4x of the typical thinking time.
    const racer = new HttpRacer(ORIGIN, { name: `Racer ${index}`, colour: COLOURS[index % COLOURS.length], thinkMs: THINK_MS * (0.7 + ((index * 37) % 71) / 100), accuracy: Math.min(1, ACCURACY - 0.08 + ((index * 13) % 17) / 100), onSample });
    racers.push(racer);
    joins.push(racer.join(code));
    await sleep(JOIN_SPACING_MS);
  }
  const joined = await Promise.all(joins);
  const joinFailures = joined.filter(reply => reply.status !== 200).length;
  const joinMs = Math.round(performance.now() - joinStarted);

  // Start: the creator's command, as the account API sends it.
  const start = await rpc("race_host_command", { p_owner_hash: owner, p_token_hash: hashToken("host", hostToken), p_command: "start", p_args: { countdownMs: 5000 } });
  if (start.phase !== "COUNTDOWN") throw new Error(`Race did not start: ${JSON.stringify(start).slice(0, 200)}`);
  const raceStarted = performance.now();

  // Reconnect: every tenth racer goes silent for eight seconds mid-race and comes back with the same seat.
  const droppers = racers.filter((_, index) => index % 10 === 5);
  const reconnects = [];
  const dropping = droppers.map(async racer => {
    await sleep(45_000 + Math.random() * 10_000);
    const before = racer.me ? { correct: racer.me.correct, x: racer.me.x, id: racer.room.me.id } : null;
    racer.stop();
    await sleep(8000);
    const started = performance.now();
    const reply = await racer.poll();
    const after = racer.me;
    reconnects.push({ ms: performance.now() - started, ok: reply.status === 200 && before !== null && racer.room.me.id === before.id && after.correct >= before.correct && after.x >= before.x });
    racer.stopped = false;
    return racer.race();
  });

  const rooms = await Promise.all(racers.map(racer => racer.race().then(async room => {
    // A racer that was told to stop for the reconnect drill is finished by its second run.
    return room;
  })));
  await Promise.all(dropping);
  const raceMs = Math.round(performance.now() - raceStarted);

  // What the server says happened.
  const final = (await racers[0].poll()).body.room ?? rooms[0];
  const standings = final.standings;
  const finishers = standings.filter(row => row.f !== null);
  let ordered = true;
  for (let index = 1; index < finishers.length; index += 1) if (finishers[index].f < finishers[index - 1].f || finishers[index].rank < finishers[index - 1].rank) ordered = false;
  const under30 = finishers.filter(row => row.correct < MIN_CORRECT).length;
  const seats = await admin.from("race_participants").select("id", { count: "exact", head: true }).eq("room_id", final.id).eq("status", "active");
  const pollBytes = Buffer.byteLength(JSON.stringify({ result: "ok", room: final }));
  await rpc("race_host_command", { p_owner_hash: owner, p_token_hash: hashToken("host", hostToken), p_command: "close", p_args: {} });

  const totalRequests = samples.join.length + samples.state.length + samples.answer.length;
  return {
    players,
    joined: players - joinFailures,
    joinAllMs: joinMs,
    raceSeconds: Math.round(raceMs / 1000),
    requests: totalRequests,
    requestsPerSecond: Math.round((totalRequests / (raceMs / 1000)) * 10) / 10,
    latencyMs: { join: summary(samples.join), poll: summary(samples.state), answer: summary(samples.answer) },
    databaseMs: { join: summary(database.join), poll: summary(database.state), answer: summary(database.answer) },
    answers: { accepted: racers.reduce((sum, racer) => sum + racer.answers, 0), refused: racers.reduce((sum, racer) => sum + racer.refused, 0) },
    errors,
    reconnects: { tried: reconnects.length, ok: reconnects.filter(item => item.ok).length, ms: summary(reconnects.map(item => item.ms)) },
    finished: finishers.length,
    finishersUnder30Correct: under30,
    finishOrderConsistent: ordered,
    finalized: final.finalized === true,
    seatsInRoom: seats.count,
    pollReplyBytes: pollBytes,
    winner: finishers[0] ? { name: finishers[0].name, seconds: Math.round(finishers[0].f / 100) / 10, correct: finishers[0].correct } : null
  };
}

const results = [];
for (const players of PLAYER_COUNTS) {
  process.stdout.write(`\n${players} racers: racing...\n`);
  const result = await oneRace(players);
  results.push(result);
  console.log(JSON.stringify(result));
  await sleep(1500);
}

console.log("\nracers  joined  finished  poll p95  answer p95  db p95(answer)  req/s  errors  reconnect  order ok  <30 correct");
for (const row of results) {
  console.log(
    [String(row.players).padStart(6), String(row.joined).padStart(6), String(row.finished).padStart(8), `${row.latencyMs.poll.p95} ms`.padStart(8), `${row.latencyMs.answer.p95} ms`.padStart(10),
      `${row.databaseMs.answer.p95} ms`.padStart(13), String(row.requestsPerSecond).padStart(5), String(Object.values(row.errors).reduce((a, b) => a + b, 0)).padStart(6),
      `${row.reconnects.ok}/${row.reconnects.tried}`.padStart(9), String(row.finishOrderConsistent).padStart(8), String(row.finishersUnder30Correct).padStart(11)].join("  ")
  );
}
if (OUT) writeFileSync(OUT, JSON.stringify({ origin: ORIGIN, thinkMs: THINK_MS, accuracy: ACCURACY, at: new Date().toISOString(), results }, null, 2));
const failed = results.some(row => row.joined !== row.players || !row.finishOrderConsistent || row.finishersUnder30Correct > 0 || row.seatsInRoom !== row.players || row.reconnects.ok !== row.reconnects.tried || Object.keys(row.errors).some(key => /:5\d\d$/.test(key)));
process.exitCode = failed ? 1 : 0;
