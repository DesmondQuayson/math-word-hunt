/**
 * Polygon Showdown — anti-cheat and access attempts against a STAGING preview.
 *
 * Launched by scripts/invoke-polygon-showdown-staging.ps1 -Stage attack
 * -Origin <preview URL>. Every attempt must fail safely: the server's replay
 * decides, money moves at most once, and nothing leaks. Uses two synthetic
 * accounts (@example.invalid); they and every room are deleted at the end.
 */
import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { sessionCookies } from "./polygon-showdown-staging-session.mjs";
import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

import { minGapAfter, TIMING } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/economy.js";
import { allLegalMoves, applySwap, CONFIG, createKnownRefills, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard, stateHash } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";
import { PENTAGON } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/shapes.js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
for (const name of Object.keys(process.env)) if (/_LIVE_|_PRODUCTION_|_READONLY_/.test(name)) throw new Error(`refusing: ${name} is present in this process`);
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
const publishable = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const supabaseUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protection = createProtectionBypass({ origin, secret: (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim() });

const results = [];
const ok = (condition, message) => {
  results.push(Boolean(condition));
  console.log(`${condition ? "ok  " : "FAIL"} ${protection.redact(message)}`);
  return Boolean(condition);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const hashToken = (kind, token) => createHash("sha256").update(`polygon-showdown\n${kind}\n${token}`).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const rpc = async (fn, args) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

const GAME_HEADERS = { "content-type": "application/json", "x-mathnexa-game": "polygon-showdown", "sec-fetch-site": "same-origin", origin };

async function call(route, body, { cookie = null, headers = GAME_HEADERS, raw = null } = {}) {
  const url = `${origin}/api/games/polygon-showdown/${route}`;
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: { ...protection.headersFor(url), ...headers, ...(cookie ? { cookie } : {}) },
    body: raw ?? JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const play = (body, options) => call("play", body, options);
const account = (cookie, body) => call("account", body, { cookie });

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

  /** Plays one honest move and keeps the server's answer. */
  async step(extra = {}) {
    const plan = this.next();
    const reply = await play({ action: "state", token: this.token, from: plan.from, moves: [plan.move], h: plan.hash, ...extra });
    if (reply.status === 200 && reply.body?.room) {
      this.state = plan.result.state;
      this.nextT = plan.move[2] + minGapAfter(plan.result.chain);
      this.room = reply.body.room;
      this.known.merge(reply.body.room.me.state.cursors, reply.body.room.me.windows);
    }
    return { plan, reply };
  }

  hasPentagon() {
    return decodeBoard(this.state.board).includes(PENTAGON);
  }
}

const run = randomBytes(4).toString("hex");
const users = [];
const rooms = [];

async function syntheticUser(role) {
  const email = `polygon-attack-${run}-${role}@example.invalid`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "polygon-showdown-staging-attack" } });
  if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  users.push(made.data.user.id);
  const session = await sessionCookies(supabaseUrl, secretKey, email, password);
  return { id: made.data.user.id, cookie: session.cookies.map(({ name, value }) => `${name}=${value}`).join("; "), accessToken: session.accessToken };
}

async function newRoom(schedule = SCHEDULES.standard, duration = 300) {
  const seed = randomBytes(16).toString("hex");
  const code = String(100000 + Math.floor(Math.random() * 899999));
  const ownerHash = sha(`attack-owner-${seed}`);
  const hostToken = newToken();
  const creatorToken = newToken();
  const created = await rpc("polygon_create_room", { p_code: code, p_owner_hash: ownerHash, p_host_token_hash: hashToken("host", hostToken), p_player_token_hash: hashToken("player", creatorToken), p_user: null, p_name: "Creator", p_emoji: null, p_duration: duration, p_seed: seed, p_state: newGameState(encodeBoard(startingBoard(seed)), CONFIG, schedule) });
  rooms.push(created.id);
  const command = (name, args = {}) => rpc("polygon_host_command", { p_owner_hash: ownerHash, p_token_hash: hashToken("host", hostToken), p_command: name, p_args: args });
  return { id: created.id, code, seed, creatorToken, command };
}

async function joinBot(code, name, cookie = null) {
  const reply = await play({ action: "join", code, name, emoji: null }, { cookie });
  if (reply.status !== 200) throw new Error(`join refused: ${reply.status} ${JSON.stringify(reply.body)}`);
  return reply.body;
}

async function counts() {
  const tally = {};
  for (const table of ["polygon_wallets", "polygon_ledger", "polygon_inventory", "polygon_profiles", "polygon_solo_runs"]) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) throw error;
    tally[table] = count;
  }
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  tally.auth_users = listed.data.users.length;
  return tally;
}

async function main() {
  // -------------------------------------------------- request discipline
  const noHeader = await play({ action: "state", token: newToken() }, { headers: { "content-type": "application/json", origin } });
  ok(noHeader.status === 403, `a request without the game header is refused (${noHeader.status})`);
  const crossSite = await play({ action: "state", token: newToken() }, { headers: { ...GAME_HEADERS, "sec-fetch-site": "cross-site" } });
  ok(crossSite.status === 403, `a cross-site request is refused (${crossSite.status})`);
  const wrongType = await play({ action: "state", token: newToken() }, { headers: { ...GAME_HEADERS, "content-type": "text/plain" } });
  ok(wrongType.status === 415, `a non-JSON request is refused (${wrongType.status})`);
  const huge = await play(null, { raw: JSON.stringify({ action: "state", padding: "x".repeat(5000) }) });
  ok(huge.status === 413, `an oversized request is refused (${huge.status})`);
  const fakeSeat = await play({ action: "state", token: newToken() });
  ok(fakeSeat.status === 404 && fakeSeat.body?.error === "seat-not-found", "an invented seat token gets nothing");
  const noSession = await call("account", { action: "bootstrap" });
  ok(noSession.status === 401, `account actions need a session (${noSession.status})`);

  // ------------------------------------------------------- a live Showdown
  const guestBaseline = await counts();
  const room = await newRoom();
  const [a, b, c] = await Promise.all([joinBot(room.code, "Attacker"), joinBot(room.code, "Bystander"), joinBot(room.code, "Witness")]);

  const attackerName = "<img src=x onerror=alert(1)>";
  const xss = await play({ action: "join", code: room.code, name: attackerName, emoji: null });
  const shownName = xss.body?.room?.me?.name ?? null;
  ok(xss.status === 400 || (shownName !== null && !/[<>]/.test(shownName)), `a markup name is refused or stripped (${xss.status}, ${JSON.stringify(shownName)})`);

  const creatorSeat = await play({ action: "state", token: room.creatorToken });
  const payloadText = JSON.stringify(creatorSeat.body);
  ok(!payloadText.includes(room.seed), "the seed is never sent to a browser");
  ok(!/token_hash|tokenHash|owner_hash|ownerHash|subject_hash/i.test(payloadText), "no token or owner hash reaches a browser");
  ok(!payloadText.includes(a.token) && !payloadText.includes(b.token), "no other player's seat token reaches a browser");
  ok(creatorSeat.body?.room?.me?.isCreator === true, "the creator is a participant in their own room");

  const started = await room.command("start");
  await sleep(Math.max(0, started.startsAtMs - Date.now()) + 400);
  const attacker = new Bot(a.token, (await play({ action: "state", token: a.token })).body.room);
  const bystander = new Bot(b.token, (await play({ action: "state", token: b.token })).body.room);
  const witness = new Bot(c.token, (await play({ action: "state", token: c.token })).body.room);
  ok(attacker.state.board !== bystander.state.board || attacker.state.board === bystander.state.board, "every seat has a board");
  ok(attacker.state.board === bystander.state.board && bystander.state.board === witness.state.board, "every seat starts on the same board");
  ok(!attacker.hasPentagon(), "Standard: no Pentagon on the opening board");

  // Fabricated score.
  const honest = await attacker.step({ coins: 999999, score: 999999, state: { coins: 999999 } });
  ok(honest.reply.status === 200 && honest.reply.body.room.me.state.coins === honest.plan.result.state.coins && honest.reply.body.room.me.state.coins < 1000, `a fabricated score is ignored; the replay's coins stand (${honest.reply.body?.room?.me?.state?.coins})`);

  // Impossible swap.
  await sleep(400);
  const impossible = await play({ action: "state", token: a.token, from: attacker.state.moves, moves: [[0, 63, attacker.nowT()]], h: 1 });
  ok(impossible.status === 200 && impossible.body.rejected === "not-adjacent" && impossible.body.room.me.state.moves === attacker.state.moves, `an impossible swap is refused (${impossible.body?.rejected})`);

  // Duplicate swap event: resending the swap the server already counted.
  const moved = attacker.state.moves;
  const coinsBefore = attacker.state.coins;
  const duplicate = await play({ action: "state", token: a.token, from: honest.plan.from, moves: [honest.plan.move], h: honest.plan.hash });
  ok(duplicate.status === 200 && duplicate.body.room.me.state.moves === moved && duplicate.body.room.me.state.coins === coinsBefore, "a duplicate swap event changes nothing");

  // Altered seed and hash: a browser cannot choose the board.
  await sleep(600);
  const altered = attacker.next();
  const tampered = await play({ action: "state", token: a.token, from: altered.from, moves: [altered.move], h: (altered.hash + 1) >>> 0, seed: "0".repeat(32), p_seed: "0".repeat(32) });
  ok(tampered.status === 200 && tampered.body.resync === true && tampered.body.room.me.state.board === altered.result.state.board, "an altered seed is ignored, and a wrong hash only earns a resync to the server's own result");
  attacker.state = altered.result.state;
  attacker.nextT = altered.move[2] + minGapAfter(altered.result.chain);
  attacker.known.merge(tampered.body.room.me.state.cursors, tampered.body.room.me.windows);

  // Time travel.
  await sleep(600);
  const future = attacker.next();
  const fromTheFuture = await play({ action: "state", token: a.token, from: future.from, moves: [[future.move[0], future.move[1], future.move[2] + 120_000]], h: future.hash });
  ok(fromTheFuture.status === 200 && fromTheFuture.body.rejected === "from-the-future", `a swap dated in the future is refused (${fromTheFuture.body?.rejected})`);
  const tooFast = attacker.next();
  const second = applySwap(tooFast.result.state, ...allLegalMoves(decodeBoard(tooFast.result.state.board), 8, 8)[0], attacker.known.at, CONFIG, tooFast.move[2] + 1);
  const moves = second.ok ? [tooFast.move, [allLegalMoves(decodeBoard(tooFast.result.state.board), 8, 8)[0][0], allLegalMoves(decodeBoard(tooFast.result.state.board), 8, 8)[0][1], tooFast.move[2] + 1]] : [tooFast.move];
  const speed = await play({ action: "state", token: a.token, from: tooFast.from, moves, h: tooFast.hash });
  ok(speed.status === 200 && (!second.ok || speed.body.rejected === "too-fast"), `superhuman speed is refused (${speed.body?.rejected})`);
  if (speed.body?.room) attacker.adopt(speed.body.room);

  // The shared schedule: nobody meets a Pentagon before the room's clock says so, and everyone is on the same one.
  const canonical = (value) => JSON.stringify(Object.entries(value ?? {}).sort(([x], [y]) => (x < y ? -1 : 1)));
  ok(canonical(attacker.state.schedule) === canonical(SCHEDULES.standard) && canonical(bystander.state.schedule) === canonical(SCHEDULES.standard) && canonical(witness.state.schedule) === canonical(SCHEDULES.standard), "every seat carries the same Standard schedule");
  const firstPentagon = {};
  const bots = { attacker, bystander, witness };
  const deadline = started.startsAtMs + 95_000;
  while (Date.now() < deadline && Object.keys(firstPentagon).length < 3) {
    for (const [name, bot] of Object.entries(bots)) {
      if (firstPentagon[name] !== undefined) continue;
      const { reply, plan } = await bot.step();
      if (reply.status === 200 && reply.body.resync) bot.adopt(reply.body.room);
      if (bot.hasPentagon()) firstPentagon[name] = plan.move[2];
    }
    await sleep(350);
  }
  console.log(`info first Pentagon by room clock (ms): ${JSON.stringify(firstPentagon)}`);
  const waveStart = SCHEDULES.standard.warmup;
  ok(Object.values(firstPentagon).length >= 1 && Object.values(firstPentagon).every((t) => t >= waveStart), "no seat met a Pentagon before the first 60 seconds of the room's clock");

  // End of the game: nothing counts after the buzzer.
  await room.command("end");
  const lateBy = TIMING.SHOWDOWN_GRACE_MS + 900;
  await sleep(lateBy);
  const before = (await play({ action: "state", token: b.token })).body.room;
  const coinsAtBuzzer = before.me.state.coins;
  const last = bystander.next();
  const tooLate = await play({ action: "state", token: b.token, from: last.from, moves: [last.move], h: last.hash });
  ok(tooLate.status === 200 && tooLate.body.rejected === "not-running" && tooLate.body.room.me.state.coins === coinsAtBuzzer, `a post-deadline score is refused (${tooLate.body?.rejected})`);

  await room.command("close");
  const afterClose = await play({ action: "state", token: b.token });
  ok(afterClose.status === 404 || afterClose.status === 410, `a seat stops working when the room closes (${afterClose.status})`);
  const guestAfter = await counts();
  ok(JSON.stringify(guestBaseline) === JSON.stringify(guestAfter), `a guest game left nothing permanent ${JSON.stringify(guestAfter)}`);

  // ---------------------------------------------- signed-in money and Solo
  const player = await syntheticUser("player");
  const other = await syntheticUser("other");

  const boot = await account(player.cookie, { action: "bootstrap" });
  ok(boot.status === 200 && boot.body.guest === false, "a signed-in account gets a wallet record");
  const solo = await account(player.cookie, { action: "solo-start", replace: false });
  ok(solo.status === 200 && solo.body.result === "started", "Solo starts for a signed-in account");
  const soloRun = solo.body.run;
  ok(!JSON.stringify(solo.body).includes("seedHash") , "the Solo payload carries no hashes");

  // Fabricated save.
  const fake = await account(player.cookie, { action: "solo-sync", run: soloRun.id, epoch: soloRun.epoch, from: soloRun.state.moves, moves: [], coins: 999999, score: 999999, checkpoint: true, balance: 999999 });
  ok(fake.status === 200 && fake.body.balance === 0 && fake.body.coins === 0, `a fabricated Solo save banks nothing (balance ${fake.body?.balance})`);
  const notAdjacent = await account(player.cookie, { action: "solo-sync", run: soloRun.id, epoch: soloRun.epoch, from: soloRun.state.moves, moves: [[0, 63, 2000]] });
  ok(notAdjacent.status === 200 && notAdjacent.body.rejected === "not-adjacent", `an impossible Solo swap is refused (${notAdjacent.body?.rejected})`);
  const forged = await account(other.cookie, { action: "solo-sync", run: soloRun.id, epoch: soloRun.epoch, from: 0, moves: [] });
  ok(forged.status === 404, `another account cannot touch this run (${forged.status})`);

  // Solo's Pentagon follows the player's own swaps: four shapes for the first ten.
  const opened = (await account(player.cookie, { action: "solo-open" })).body.run;
  const openedAt = performance.now();
  const soloKnown = createKnownRefills();
  soloKnown.merge(opened.state.cursors, opened.windows);
  let soloState = opened.state;
  let soloNext = opened.nextT;
  let firstSoloPentagon = null;
  let soloRefused = null;
  for (let index = 0; index < 34 && firstSoloPentagon === null && soloRefused === null; index += 1) {
    const legal = allLegalMoves(decodeBoard(soloState.board), 8, 8);
    const [x, y] = legal[index % legal.length];
    const t = Math.max(Math.round(opened.nowT + performance.now() - openedAt), soloNext);
    const result = applySwap(soloState, x, y, soloKnown.at, CONFIG, t);
    if (!result.ok) throw new Error(`solo bot produced an illegal swap: ${result.reason}`);
    const reply = await account(player.cookie, { action: "solo-sync", run: opened.id, epoch: opened.epoch, from: soloState.moves, moves: [[x, y, t]], h: stateHash(result.state) });
    if (reply.status !== 200 || reply.body?.rejected) {
      soloRefused = reply.body?.rejected ?? reply.status;
      break;
    }
    soloState = result.state;
    soloNext = t + minGapAfter(result.chain);
    soloKnown.merge(reply.body.cursors, reply.body.windows);
    if (decodeBoard(soloState.board).includes(PENTAGON)) firstSoloPentagon = soloState.moves;
    await sleep(Math.max(0, soloNext - (opened.nowT + performance.now() - openedAt)) + 30);
  }
  console.log(`info Solo: first Pentagon after swap ${firstSoloPentagon}; swaps played ${soloState.moves}`);
  ok(soloRefused === null, `honest Solo swaps are accepted by the hosted replay (${soloRefused ?? "none refused"})`);
  ok(firstSoloPentagon === null || firstSoloPentagon >= 11, "Solo: no Pentagon during the first ten swaps");

  // Price tampering and duplicate purchase.
  const { error: fundError } = await admin.from("polygon_wallets").upsert({ user_id: player.id, balance: 1000 });
  if (fundError) throw fundError;
  const price = (await admin.from("polygon_shop_items").select("price").eq("item_key", "hat-fedora").single()).data.price;
  const key = `attack-${randomBytes(8).toString("hex")}`;
  const [first, again] = await Promise.all([
    account(player.cookie, { action: "purchase", item: "hat-fedora", key, price: 1 }),
    account(player.cookie, { action: "purchase", item: "hat-fedora", key, price: 1 })
  ]);
  const balanceAfter = (await admin.from("polygon_wallets").select("balance").eq("user_id", player.id).single()).data.balance;
  const purchases = (await admin.from("polygon_ledger").select("id", { count: "exact", head: true }).eq("user_id", player.id).eq("event", "PURCHASE_ITEM")).count;
  ok(first.status === 200 && again.status === 200 && balanceAfter === 1000 - price && purchases === 1, `a double-submitted purchase charges once, at the catalog price (balance ${balanceAfter}, lines ${purchases})`);
  const newKey = await account(player.cookie, { action: "purchase", item: "hat-fedora", key: `attack-${randomBytes(8).toString("hex")}` });
  const balanceNow = (await admin.from("polygon_wallets").select("balance").eq("user_id", player.id).single()).data.balance;
  ok(balanceNow === 1000 - price && newKey.body?.result !== "purchased", `buying an owned item again charges nothing (${newKey.body?.result})`);
  const tooDear = await account(player.cookie, { action: "purchase", item: "hat-supernova-halo", key: `attack-${randomBytes(8).toString("hex")}` });
  const balanceUnchanged = (await admin.from("polygon_wallets").select("balance").eq("user_id", player.id).single()).data.balance === balanceNow;
  ok(tooDear.body?.result === "insufficient" && balanceUnchanged, `an unaffordable item is refused and charges nothing (${tooDear.body?.result ?? tooDear.status})`);
  const ghost = await account(player.cookie, { action: "purchase", item: "no-such-item", key: `attack-${randomBytes(8).toString("hex")}` });
  ok(ghost.status === 404, `an invented item is refused (${ghost.status})`);
  const notOwned = await account(other.cookie, { action: "avatar-save", avatar: { base: "base-a", skin: "skin-3", hair: "hair-short", hairColor: "hc-black", facialHair: "fh-none", lipstick: "lip-none", eyeShadow: "shadow-none", blush: "blush-none", eyeliner: "liner-none", top: "top-everyday", bottom: "bottom-jeans", shoes: "shoes-golden-apex" } });
  ok(notOwned.status === 403, `equipping an unowned item is refused (${notOwned.status})`);

  // A signed-in Showdown reward arrives once however often the result is requested.
  const paid = await newRoom();
  const seat = await joinBot(paid.code, "Earner", player.cookie);
  const paidStart = await paid.command("start");
  await sleep(Math.max(0, paidStart.startsAtMs - Date.now()) + 400);
  const earner = new Bot(seat.token, (await play({ action: "state", token: seat.token })).body.room);
  for (let index = 0; index < 4; index += 1) {
    await earner.step();
    await sleep(700);
  }
  await paid.command("end");
  await sleep(TIMING.SHOWDOWN_GRACE_MS + 700);
  for (let round = 0; round < 6; round += 1) {
    const replies = await Promise.all([play({ action: "state", token: seat.token }), play({ action: "state", token: paid.creatorToken })]);
    if (replies[0].body?.room?.finalized) break;
    await sleep(400);
  }
  await Promise.all(Array.from({ length: 5 }, () => play({ action: "state", token: seat.token })));
  const rewards = (await admin.from("polygon_ledger").select("id", { count: "exact", head: true }).eq("user_id", player.id).eq("event", "EARN_SHOWDOWN")).count;
  ok(rewards === 1, `a repeated result request pays the reward once (lines ${rewards})`);
  await paid.command("close");

  // ------------------------------------------------- what the database allows
  const rewrite = await admin.from("polygon_ledger").update({ amount: 1 }).eq("user_id", player.id);
  ok(Boolean(rewrite.error), "even the application cannot rewrite a ledger line");
  const erase = await admin.from("polygon_ledger").delete().eq("user_id", player.id);
  ok(Boolean(erase.error), "even the application cannot delete a ledger line");
  if (publishable) {
    const headers = { apikey: publishable, Authorization: `Bearer ${player.accessToken}` };
    for (const table of ["polygon_wallets", "polygon_ledger", "polygon_inventory", "polygon_solo_runs", "polygon_rooms", "polygon_participants"]) {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, { headers });
      const rows = await response.json().catch(() => null);
      ok(!response.ok || (Array.isArray(rows) && rows.length === 0), `a signed-in browser cannot read ${table} directly (${response.status})`);
    }
    const buy = await fetch(`${supabaseUrl}/rest/v1/rpc/polygon_purchase`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ p_user: player.id, p_item: "hat-beanie", p_key: "direct-call-0001" }) });
    ok(!buy.ok, `a browser cannot call the purchase function directly (${buy.status})`);
  } else {
    console.log("info publishable key not in the vault; direct browser-identity checks skipped");
  }

  // ------------------------------------------------------------ rate limits
  const subject = sha(`attack-subject-${run}`);
  let limited = false;
  for (let index = 0; index < 45 && !limited; index += 1) {
    const refused = await rpc("polygon_join_room", { p_code: "100000", p_name: "Guesser", p_emoji: null, p_token_hash: sha(`guess-${index}-${run}`), p_subject_hash: subject, p_user: null });
    limited = refused.result === "rate-limited";
  }
  ok(limited, "repeated wrong codes from one address are stopped");
  await admin.from("bingo_join_failures").delete().eq("subject_hash", subject);

  const owner = sha(`attack-rate-owner-${run}`);
  let createdRooms = 0;
  let stopped = false;
  for (let index = 0; index < 14 && !stopped; index += 1) {
    const seed = randomBytes(16).toString("hex");
    const made = await rpc("polygon_create_room", { p_code: String(100000 + Math.floor(Math.random() * 899999)), p_owner_hash: owner, p_host_token_hash: sha(`host-${index}-${run}`), p_player_token_hash: sha(`seat-${index}-${run}`), p_user: null, p_name: "Spammer", p_emoji: null, p_duration: 300, p_seed: seed, p_state: newGameState(encodeBoard(startingBoard(seed)), CONFIG, SCHEDULES.standard) });
    if (made.result === "rate-limited") stopped = true;
    else if (made.id) {
      createdRooms += 1;
      rooms.push(made.id);
    }
  }
  ok(stopped && createdRooms === 12, `a creator is limited to 12 rooms in 10 minutes (${createdRooms})`);

  // ---------------------------------------------------------- shared /join
  const polygonRoom = await newRoom();
  const bingoCode = String(100000 + Math.floor(Math.random() * 899999));
  const bingoHost = sha(`bingo-host-${run}`);
  const settings = { mode: "addition", level: "facts-10", questionSeconds: 0, revealSeconds: 0, patterns: { rows: true, columns: true, diagonals: false }, winners: 3, freeSpace: true, music: "host", celebration: "host", equivalentFractions: false };
  await rpc("bingo_create_room", { p_code: bingoCode, p_owner_hash: sha(`bingo-owner-${run}`), p_host_token_hash: bingoHost, p_settings: settings });
  try {
    ok((await rpc("live_room_game_for_code", { p_code: polygonRoom.code })) === "polygon_showdown", "a Showdown code belongs to the Showdown");
    ok((await rpc("live_room_game_for_code", { p_code: bingoCode })) === "math_bingo_live", "a Bingo code belongs to Bingo");
    const page = async (code) => {
      const url = `${origin}/join?code=${code}`;
      const response = await fetch(url, { headers: protection.headersFor(url), redirect: "manual" });
      return { status: response.status, html: await response.text() };
    };
    const polygonPage = await page(polygonRoom.code);
    const bingoPage = await page(bingoCode);
    ok(polygonPage.status === 200 && /polygon/i.test(polygonPage.html.slice(0, 4000)) && polygonPage.html.includes("polygon-showdown"), "/join opens a Showdown code on the Showdown");
    ok(bingoPage.status === 200 && bingoPage.html.includes("math-bingo-live") && !bingoPage.html.includes("internal-games/polygon-showdown/src/join"), "/join opens a Bingo code on Bingo");
    const seed = randomBytes(16).toString("hex");
    const collide = await rpc("polygon_create_room", { p_code: bingoCode, p_owner_hash: sha(`collide-${run}`), p_host_token_hash: sha(`collide-host-${run}`), p_player_token_hash: sha(`collide-seat-${run}`), p_user: null, p_name: "Collider", p_emoji: null, p_duration: 300, p_seed: seed, p_state: newGameState(encodeBoard(startingBoard(seed)), CONFIG, SCHEDULES.standard) });
    ok(collide.result === "code-taken", `a Showdown cannot take an open Bingo code (${collide.result})`);
    const reverse = await admin.rpc("bingo_create_room", { p_code: polygonRoom.code, p_owner_hash: sha(`reverse-${run}`), p_host_token_hash: sha(`reverse-host-${run}`), p_settings: settings });
    ok(Boolean(reverse.error) || reverse.data?.result !== "created", `Bingo cannot take an open Showdown code (${reverse.data?.result ?? "refused"})`);
  } finally {
    await admin.from("bingo_rooms").delete().eq("code", bingoCode);
    await admin.from("bingo_rooms").delete().eq("code", polygonRoom.code).eq("host_token_hash", sha(`reverse-host-${run}`));
  }
}

try {
  await main();
} catch (error) {
  ok(false, `attack run stopped: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const id of rooms) await admin.from("polygon_rooms").delete().eq("id", id);
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
const failed = results.filter((passed) => !passed).length;
console.log(`RESULT ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
