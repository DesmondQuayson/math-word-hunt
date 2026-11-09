/**
 * Polygon Showdown — PRODUCTION guest QA after the release. Launched by
 * scripts/invoke-polygon-showdown-production.ps1 -Stage qa, which loads only the
 * production project ref and service key.
 *
 * No account and no password. The creator side of a synthetic room is driven
 * through the room's own service-role functions; every guest uses the public
 * https://mathnexa.com endpoints, as plain HTTP clients and as two real phone
 * browsers opening the join link. About ten players for a little over a minute:
 * a light check, not a stress test. Every synthetic room is deleted at the end.
 * Signed-in flows are verified separately with the owner's own sign-in.
 */
import { createHash, randomBytes } from "node:crypto";

import { chromium, devices, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { minGapAfter, TIMING } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/economy.js";
import { allLegalMoves, applySwap, CONFIG, createKnownRefills, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard, stateHash } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";
import { PENTAGON } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/shapes.js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = "https://mathnexa.com";
const ref = (process.env.SUPABASE_PRODUCTION_PROJECT_REF ?? "").trim().toLowerCase();
if (!/^[a-z]{20}$/.test(ref) || ref === STAGING_PROJECT_REF) throw new Error("refusing: production project ref missing, malformed or staging");
const secretKey = (process.env.SUPABASE_PRODUCTION_SECRET_KEY ?? "").trim();
const publishable = (process.env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY ?? "").trim();
const expectBuild = (process.env.EXPECT_BUILD ?? "").trim();
const supabaseUrl = `https://${ref}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const redact = (text) => [secretKey, publishable].reduce((value, secret) => (secret ? value.split(secret).join("[redacted]") : value), String(text));
const ok = (condition, message) => {
  results.push(Boolean(condition));
  console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`);
  return Boolean(condition);
};
const info = (message) => console.log(`info ${redact(message)}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const hashToken = (kind, token) => sha(`polygon-showdown\n${kind}\n${token}`);
const newToken = () => randomBytes(32).toString("base64url");
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]);
};
const rpc = async (fn, args) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

const GAME_HEADERS = { "content-type": "application/json", "x-mathnexa-game": "polygon-showdown", "sec-fetch-site": "same-origin", origin };
const latencies = [];
const statuses = {};
async function play(body, { headers = GAME_HEADERS, raw = null, measure = true } = {}) {
  const started = performance.now();
  const response = await fetch(`${origin}/api/games/polygon-showdown/play`, { method: "POST", redirect: "manual", headers, body: raw ?? JSON.stringify(body) });
  const parsed = await response.json().catch(() => null);
  if (measure) {
    latencies.push(performance.now() - started);
    statuses[response.status] = (statuses[response.status] ?? 0) + 1;
  }
  return { status: response.status, body: parsed };
}

class Bot {
  constructor(token, room) {
    this.token = token;
    this.adopt(room);
    this.offset = room.nowMs - performance.now();
  }

  adopt(room) {
    this.room = room;
    const me = room.me;
    this.state = me.state;
    this.nextT = me.nextT;
    this.known = createKnownRefills();
    this.known.merge(me.state.cursors, me.windows);
  }

  nowT() {
    return Math.round(performance.now() + this.offset - this.room.startsAtMs);
  }

  next() {
    const moves = allLegalMoves(decodeBoard(this.state.board), 8, 8);
    const [a, b] = moves[0];
    const t = Math.max(this.nowT(), this.nextT);
    const result = applySwap(this.state, a, b, this.known.at, CONFIG, t);
    if (!result.ok) throw new Error(`bot produced an illegal swap: ${result.reason}`);
    return { move: [a, b, t], result, hash: stateHash(result.state), from: this.state.moves };
  }

  async step(extra = {}) {
    const plan = this.next();
    const reply = await play({ action: "state", token: this.token, from: plan.from, moves: [plan.move], h: plan.hash, ...extra });
    if (reply.status === 200 && reply.body?.room) {
      this.state = plan.result.state;
      this.nextT = plan.move[2] + minGapAfter(plan.result.chain);
      this.room = reply.body.room;
      this.known.merge(reply.body.room.me.state.cursors, reply.body.room.me.windows);
      if (reply.body.resync) this.adopt(reply.body.room);
    }
    return { plan, reply };
  }

  hasPentagon() {
    return decodeBoard(this.state.board).includes(PENTAGON);
  }
}

const rooms = [];
const bingoCodes = [];

async function newRoom() {
  const seed = randomBytes(16).toString("hex");
  const code = String(100000 + Math.floor(Math.random() * 899999));
  const ownerHash = sha(`qa-owner-${seed}`);
  const hostToken = newToken();
  const creatorToken = newToken();
  const created = await rpc("polygon_create_room", { p_code: code, p_owner_hash: ownerHash, p_host_token_hash: hashToken("host", hostToken), p_player_token_hash: hashToken("player", creatorToken), p_user: null, p_name: "Creator", p_emoji: null, p_duration: 300, p_seed: seed, p_state: newGameState(encodeBoard(startingBoard(seed)), CONFIG, SCHEDULES.standard) });
  rooms.push(created.id);
  return { id: created.id, code, seed, creatorToken, command: (name, args = {}) => rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: name, p_args: args }) };
}

async function joinBot(code, name, emoji = null) {
  const reply = await play({ action: "join", code, name, emoji });
  if (reply.status !== 200) throw new Error(`join refused: ${reply.status} ${JSON.stringify(reply.body)}`);
  return reply.body;
}

const page = async (path) => {
  const response = await fetch(`${origin}${path}`, { redirect: "manual" });
  return { status: response.status, location: response.headers.get("location"), type: response.headers.get("content-type"), text: await response.text() };
};

async function phone(browserType, device, code, name) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...device });
  const client = await context.newPage();
  const errors = [];
  client.on("pageerror", (error) => { if (!/due to access control checks/.test(error.message)) errors.push(error.message); });
  await client.goto(`${origin}/join?code=${code}`, { waitUntil: "domcontentloaded" });
  await client.locator("#name").fill(name);
  await client.locator("#join-game").click();
  await client.waitForFunction(() => ["lobby", "showdown"].includes(document.body.dataset.screen), null, { timeout: 60_000, polling: 200 });
  return { browser, context, page: client, errors };
}

const browserState = (client) => client.evaluate(() => window.__POLYGON_SHOWDOWN__.showdown.game.state);

async function browserMove(client) {
  await client.waitForFunction(() => !window.__POLYGON_SHOWDOWN__.showdown.game.busy && !document.querySelector(".board")?.classList.contains("locked"), null, { timeout: 45_000, polling: 150 });
  const state = await browserState(client);
  const [a, b] = allLegalMoves(decodeBoard(state.board), 8, 8)[0];
  await client.bringToFront();
  await client.locator(`.cell[data-cell="${a}"]`).click({ timeout: 15_000 });
  await client.locator(`.cell[data-cell="${b}"]`).click({ timeout: 15_000 });
  await client.waitForFunction((count) => window.__POLYGON_SHOWDOWN__.showdown.game.state.moves > count, state.moves, { timeout: 30_000, polling: 150 });
  return browserState(client);
}

async function main() {
  // --------------------------------------------------- what is being served
  const health = await (await fetch(`${origin}/api/health`)).json();
  ok(health.status === "ready" && (!expectBuild || health.build === expectBuild), `health is ready on the expected build (${String(health.build).slice(0, 7)})`);
  ok((await page("/join")).status === 200, "/join answers");
  const signedOut = await page("/games/polygon-showdown/play");
  ok([302, 303, 307].includes(signedOut.status) && /sign-in|access/.test(signedOut.location ?? ""), `signed-out visitors are sent to sign in (${signedOut.status} ${signedOut.location})`);

  // ------------------------------------------------------- request discipline
  ok((await play({ action: "state", token: newToken() }, { headers: { "content-type": "application/json", origin }, measure: false })).status === 403, "a request without the game header is refused");
  ok((await play({ action: "state", token: newToken() }, { headers: { ...GAME_HEADERS, "sec-fetch-site": "cross-site" }, measure: false })).status === 403, "a cross-site request is refused");
  ok((await play(null, { raw: JSON.stringify({ action: "state", padding: "x".repeat(5000) }), measure: false })).status === 413, "an oversized request is refused");
  const forgedSeat = await play({ action: "state", token: newToken() }, { measure: false });
  ok(forgedSeat.status === 404 && forgedSeat.body?.error === "seat-not-found", "a forged seat token gets nothing");
  const unknown = await play({ action: "join", code: "100000", name: "Nobody", emoji: null }, { measure: false });
  ok(unknown.status === 404 && JSON.stringify(unknown.body) === JSON.stringify({ error: "room-not-found" }), `an unknown code gets a plain refusal (${JSON.stringify(unknown.body)})`);
  const accountWithoutSession = await fetch(`${origin}/api/games/polygon-showdown/account`, { method: "POST", redirect: "manual", headers: GAME_HEADERS, body: JSON.stringify({ action: "bootstrap" }) });
  ok(accountWithoutSession.status === 401, `account actions need a session (${accountWithoutSession.status})`);

  // ------------------------------------------------------------ shared /join
  const room = await newRoom();
  const bingoCode = String(100000 + Math.floor(Math.random() * 899999));
  bingoCodes.push(bingoCode);
  const settings = { mode: "addition", level: "facts-10", questionSeconds: 0, revealSeconds: 0, patterns: { rows: true, columns: true, diagonals: false }, winners: 3, freeSpace: true, music: "host", celebration: "host", equivalentFractions: false };
  await rpc("bingo_create_room", { p_code: bingoCode, p_owner_hash: sha(`qa-bingo-owner-${room.seed}`), p_host_token_hash: sha(`qa-bingo-host-${room.seed}`), p_settings: settings });
  ok((await rpc("live_room_game_for_code", { p_code: room.code })) === "polygon_showdown", "a Polygon Showdown code belongs to Polygon Showdown");
  ok((await rpc("live_room_game_for_code", { p_code: bingoCode })) === "math_bingo_live", "a Math Bingo Live code belongs to Math Bingo Live");
  const polygonPage = await page(`/join?code=${room.code}`);
  const bingoPage = await page(`/join?code=${bingoCode}`);
  const unknownPage = await page("/join?code=111111");
  ok(polygonPage.status === 200 && polygonPage.text.includes("internal-games/polygon-showdown/"), "/join opens a Polygon Showdown code on Polygon Showdown");
  ok(bingoPage.status === 200 && bingoPage.text.includes("internal-games/math-bingo-live/") && !bingoPage.text.includes("internal-games/polygon-showdown/"), "/join opens a Math Bingo Live code on Math Bingo Live");
  ok(unknownPage.status === 200 && !unknownPage.text.includes(room.code), "/join with an unknown code stays on the friendly page and reveals nothing");
  const seedForCollision = randomBytes(16).toString("hex");
  const collide = await rpc("polygon_create_room", { p_code: bingoCode, p_owner_hash: sha(`qa-collide-${seedForCollision}`), p_host_token_hash: sha(`qa-collide-host-${seedForCollision}`), p_player_token_hash: sha(`qa-collide-seat-${seedForCollision}`), p_user: null, p_name: "Collider", p_emoji: null, p_duration: 300, p_seed: seedForCollision, p_state: newGameState(encodeBoard(startingBoard(seedForCollision)), CONFIG, SCHEDULES.standard) });
  ok(collide.result === "code-taken", `a Showdown cannot take an open Bingo code (${collide.result})`);
  const reverse = await admin.rpc("bingo_create_room", { p_code: room.code, p_owner_hash: sha(`qa-reverse-${room.seed}`), p_host_token_hash: sha(`qa-reverse-host-${room.seed}`), p_settings: settings });
  ok(Boolean(reverse.error) || reverse.data?.result !== "created", "Bingo cannot take an open Showdown code");
  await admin.from("bingo_rooms").delete().eq("code", bingoCode);

  // -------------------------------------------------------------- the lobby
  const markup = await play({ action: "join", code: room.code, name: "<img src=x onerror=alert(1)>", emoji: null }, { measure: false });
  ok(markup.status === 400, `a markup name is refused (${markup.status})`);
  const [a, b, c] = await Promise.all([joinBot(room.code, "Attacker", "🦁"), joinBot(room.code, "Bystander"), joinBot(room.code, "Witness")]);
  ok(a.room?.me?.emoji === "🦁", "a guest joins by numeric code with a name and an emoji");
  const extras = await Promise.all(Array.from({ length: 4 }, (_, index) => joinBot(room.code, `Player ${index + 1}`)));
  const iphone = await phone(webkit, devices["iPhone 13"], room.code, "Phone A");
  const pixel = await phone(chromium, devices["Pixel 7"], room.code, "Phone B");
  ok(true, "two real phone browsers joined from the room's join link");

  const creatorSeat = await play({ action: "state", token: room.creatorToken });
  const payload = JSON.stringify(creatorSeat.body);
  ok(!payload.includes(room.seed), "the seed is never sent to a browser");
  ok(!/token_hash|tokenHash|owner_hash|ownerHash|subject_hash/i.test(payload) && !payload.includes(a.token), "no token or hash reaches a browser");
  ok(creatorSeat.body?.room?.me?.isCreator === true, "the creator is participant one in their own room");

  // ------------------------------------------------------------- the game
  const started = await room.command("start");
  await sleep(Math.max(0, started.startsAtMs - Date.now()) + 400);
  const fetchRoom = async (token) => (await play({ action: "state", token })).body.room;
  const attacker = new Bot(a.token, await fetchRoom(a.token));
  const bystander = new Bot(b.token, await fetchRoom(b.token));
  const witness = new Bot(c.token, await fetchRoom(c.token));
  const others = await Promise.all(extras.map(async (seat) => new Bot(seat.token, await fetchRoom(seat.token))));
  const creator = new Bot(room.creatorToken, await fetchRoom(room.creatorToken));
  const seats = [attacker, bystander, witness, creator, ...others];
  ok(new Set(seats.map((seat) => seat.state.board)).size === 1, "every seat starts on the same board");
  ok(seats.every((seat) => !seat.hasPentagon()), "Standard: no Pentagon on any opening board");
  const canonical = (value) => JSON.stringify(Object.entries(value ?? {}).sort(([x], [y]) => (x < y ? -1 : 1)));
  ok(seats.every((seat) => canonical(seat.state.schedule) === canonical(SCHEDULES.standard)), "every seat carries the same certified Standard schedule");

  const fair = await attacker.step({ coins: 999999, score: 999999, state: { coins: 999999 } });
  ok(fair.reply.status === 200 && fair.reply.body.room.me.state.coins === fair.plan.result.state.coins && fair.reply.body.room.me.state.coins < 1000, `a fabricated score is ignored (${fair.reply.body?.room?.me?.state?.coins})`);
  await sleep(450);
  const impossible = await play({ action: "state", token: a.token, from: attacker.state.moves, moves: [[0, 63, attacker.nowT()]], h: 1 });
  ok(impossible.status === 200 && impossible.body.rejected === "not-adjacent" && impossible.body.room.me.state.moves === attacker.state.moves, `an invalid swap is refused (${impossible.body?.rejected})`);
  const duplicate = await play({ action: "state", token: a.token, from: fair.plan.from, moves: [fair.plan.move], h: fair.plan.hash });
  ok(duplicate.status === 200 && duplicate.body.room.me.state.moves === attacker.state.moves && duplicate.body.room.me.state.coins === attacker.state.coins, "a duplicate swap changes nothing");
  await sleep(450);
  const altered = attacker.next();
  const tampered = await play({ action: "state", token: a.token, from: altered.from, moves: [altered.move], h: (altered.hash + 1) >>> 0, seed: "0".repeat(32) });
  ok(tampered.status === 200 && tampered.body.resync === true && tampered.body.room.me.state.board === altered.result.state.board, "an altered seed and hash change nothing but a resync");
  attacker.state = altered.result.state;
  attacker.nextT = altered.move[2] + minGapAfter(altered.result.chain);
  attacker.known.merge(tampered.body.room.me.state.cursors, tampered.body.room.me.windows);
  await sleep(450);
  const future = attacker.next();
  const fromTheFuture = await play({ action: "state", token: a.token, from: future.from, moves: [[future.move[0], future.move[1], future.move[2] + 120_000]], h: future.hash });
  ok(fromTheFuture.status === 200 && fromTheFuture.body.rejected === "from-the-future", `a swap dated in the future is refused (${fromTheFuture.body?.rejected})`);

  // Real taps on real phone browsers.
  const iphoneAfter = await browserMove(iphone.page);
  const pixelAfter = await browserMove(pixel.page);
  ok(iphoneAfter.moves > 0 && pixelAfter.moves > 0, "both phones swapped with real taps");
  ok(iphoneAfter.board !== pixelAfter.board || iphoneAfter.moves === pixelAfter.moves, "phones keep independent boards");

  // About ten players, a little over a minute, past the Pentagon's first wave.
  const firstPentagon = new Map();
  const until = started.startsAtMs + 80_000;
  let lateBot = null;
  let lateJoined = false;
  let dropped = false;
  while (Date.now() < until) {
    const active = lateBot ? [...seats, lateBot] : seats;
    await Promise.all(active.map(async (seat) => {
      const { reply } = await seat.step();
      if (reply.status === 200 && seat.hasPentagon() && !firstPentagon.has(seat)) firstPentagon.set(seat, seat.state.moves && seat.nowT());
    }));
    if (!lateJoined && Date.now() > started.startsAtMs + 25_000) {
      lateJoined = true;
      const late = await joinBot(room.code, "Late Arrival");
      lateBot = new Bot(late.token, late.room);
      ok(late.room.phase === "ACTIVE" && late.room.me.state.board === seats[1].room.me.state.board === false || late.room.phase === "ACTIVE", "a late arrival joins a running game");
      ok(late.room.startsAtMs === started.startsAtMs, "a late arrival shares the room's clock");
    }
    if (!dropped && Date.now() > started.startsAtMs + 40_000) {
      dropped = true;
      const before = { moves: bystander.state.moves, coins: bystander.state.coins, board: bystander.state.board };
      await sleep(4000);
      const back = (await play({ action: "state", token: b.token })).body.room;
      ok(back.me.state.moves === before.moves && back.me.state.coins === before.coins && back.me.state.board === before.board, "a guest reconnecting with their seat gets the same board, moves and coins");
    }
    await sleep(1400);
  }
  const reloadBefore = await browserState(iphone.page);
  await iphone.page.reload({ waitUntil: "domcontentloaded" });
  await iphone.page.waitForFunction(() => window.__POLYGON_SHOWDOWN__?.showdown?.game?.state != null, null, { timeout: 45_000, polling: 200 });
  const reloadAfter = await browserState(iphone.page);
  ok(reloadAfter.moves === reloadBefore.moves && reloadAfter.board === reloadBefore.board, "a phone reloading mid-game returns to the same seat and board");

  const times = [...firstPentagon.values()];
  info(`first Pentagon by room clock (ms): ${JSON.stringify(times)}`);
  ok(times.length >= 1 && times.every((t) => t >= SCHEDULES.standard.warmup), "no seat met a Pentagon before the first 60 seconds of the room's clock");
  ok(!Object.keys(statuses).some((status) => Number(status) >= 500), `no server errors during play ${JSON.stringify(statuses)}`);
  info(`lightweight load: ${latencies.length} requests, ${seats.length + 3} players, median ${percentile(latencies, 0.5)} ms, p95 ${percentile(latencies, 0.95)} ms, max ${percentile(latencies, 1)} ms`);
  ok(percentile(latencies, 0.95) < 1500, `latency normal for this size (p95 ${percentile(latencies, 0.95)} ms)`);

  // ---------------------------------------------------------- the end of it
  await room.command("end");
  await sleep(TIMING.SHOWDOWN_GRACE_MS + 900);
  const beforeLate = (await play({ action: "state", token: b.token })).body.room;
  const last = bystander.next();
  const tooLate = await play({ action: "state", token: b.token, from: last.from, moves: [last.move], h: last.hash });
  ok(tooLate.status === 200 && tooLate.body.rejected === "not-running" && tooLate.body.room.me.state.coins === beforeLate.me.state.coins, `a post-deadline score is refused (${tooLate.body?.rejected})`);
  let final = null;
  for (let attempt = 0; attempt < 30 && !final?.finalized; attempt += 1) {
    final = (await play({ action: "state", token: room.creatorToken })).body.room;
    if (!final?.finalized) await sleep(300);
  }
  ok(final?.finalized === true, "the game finalizes");
  const rows = final.standings.rows;
  ok(rows.length >= seats.length && rows.every((row, index) => index === 0 || rows[index - 1].coins >= row.coins), `the final leaderboard is complete and sorted (${rows.length} rows)`);
  ok(rows.some((row) => row.isCreator === true || row.name === "Creator"), "the creator is ranked with everyone else");
  const coinsById = new Map(rows.map((row) => [row.id, row.coins]));
  const mine = new Set(seats.map((seat) => seat.room.me.id));
  ok([...mine].every((id) => coinsById.has(id)), "every seat appears on the leaderboard");

  const members = await admin.from("polygon_participants").select("id,user_id").eq("room_id", room.id);
  ok(!members.error && members.data.length >= seats.length && members.data.every((row) => row.user_id === null), `every guest seat has no account (${members.data?.length} seats)`);
  const earned = await admin.from("polygon_ledger").select("id", { count: "exact", head: true }).like("idempotency_key", `showdown:${room.id}:%`);
  ok(earned.count === 0, "a guest game paid nothing permanent");
  await room.command("close");
  const afterClose = await play({ action: "state", token: b.token }, { measure: false });
  ok(afterClose.status === 404 || afterClose.status === 410, `a seat stops working when the room closes (${afterClose.status})`);
  ok(iphone.errors.length === 0 && pixel.errors.length === 0, `no script errors on the phones ${JSON.stringify([...iphone.errors, ...pixel.errors]).slice(0, 200)}`);
  await iphone.browser.close();
  await pixel.browser.close();

  // ------------------------------------------------------ what the database allows
  const rewrite = await admin.from("polygon_ledger").update({ amount: 1 }).eq("id", -1);
  ok(Boolean(rewrite.error), "the application role cannot rewrite the ledger");
  const erase = await admin.from("polygon_ledger").delete().eq("id", -1);
  ok(Boolean(erase.error), "the application role cannot delete from the ledger");
  if (publishable) {
    const browser = createClient(supabaseUrl, publishable, { auth: { persistSession: false } });
    for (const table of ["polygon_wallets", "polygon_ledger", "polygon_inventory", "polygon_solo_runs", "polygon_rooms", "polygon_participants"]) {
      const read = await browser.from(table).select("*").limit(1);
      ok(read.error || (read.data?.length ?? 0) === 0, `a browser cannot read ${table} directly`);
    }
    const buy = await browser.rpc("polygon_purchase", { p_user: "00000000-0000-0000-0000-000000000000", p_item: "hat-beanie", p_key: "qa-direct-call" });
    ok(Boolean(buy.error), "a browser cannot call the purchase function directly");
  } else {
    info("no publishable key in the vault; direct browser-identity checks skipped");
  }

  // ------------------------------------------------------------- assets and catalog
  const music = await fetch(`${origin}/media/audio/cosmic-candy-catchers.mp3`, { headers: { range: "bytes=0-1023" } });
  ok([200, 206].includes(music.status) && /audio/.test(music.headers.get("content-type") ?? ""), `the shared music track is served (${music.status})`);
  await music.arrayBuffer();
  for (const path of ["/media/games/polygon-showdown.avif", "/internal-games/polygon-showdown/products/hat-polygon-crown-200.webp", "/internal-games/polygon-showdown/products/shoes-golden-apex-400.avif"]) {
    const asset = await fetch(`${origin}${path}`);
    ok(asset.status === 200, `${path} is served`);
    await asset.arrayBuffer();
  }
  const catalog = await page("/math-games");
  ok(catalog.status === 200 && catalog.text.includes("Polygon Showdown") && catalog.text.includes("customize your avatar"), "the Math Games page lists Polygon Showdown with the approved description");
  const article = catalog.text.match(/<article[^>]*data-game="polygon-showdown"[\s\S]*?<\/article>/)?.[0] ?? "";
  ok(/game-free-badge/.test(article) && !/subscription/i.test(article), "its card says Free and mentions no subscription");
  const home = await page("/");
  info(`homepage mentions Polygon Showdown: ${home.text.includes("Polygon Showdown")}`);
}

try {
  await main();
} catch (error) {
  ok(false, `QA run stopped: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const id of rooms) await admin.from("polygon_rooms").delete().eq("id", id);
  for (const code of bingoCodes) await admin.from("bingo_rooms").delete().eq("code", code);
}
const failed = results.filter((passed) => !passed).length;
console.log(`RESULT ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
