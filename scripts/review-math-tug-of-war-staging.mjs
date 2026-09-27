/**
 * Math Tug of War — real-browser review of a STAGING deployment.
 *
 * Launched by scripts/invoke-math-tug-of-war-staging.ps1 -Stage review
 * -Origin <staging preview URL>, which supplies the staging Supabase secret
 * key and the Vercel protection-bypass entry (Deployment Protection is not
 * changed; the value travels only in request headers/cookie and is never
 * printed). Two synthetic subscriber accounts are created on STAGING and
 * deleted at the end, with every room they opened. The game runs under its
 * real route CSP (no CSP bypass).
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (!/^[A-Za-z0-9_-]{20,}$/.test(bypass)) throw new Error("missing protection-bypass entry");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
if (secretKey.length < 20) throw new Error("missing staging secret key");
const expectCommit = (process.env.EXPECT_COMMIT ?? "").trim();
const out = resolve(process.env.REVIEW_OUT ?? "owner-review/math-tug-of-war-v1/staging");
mkdirSync(out, { recursive: true });

const admin = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomBytes(3).toString("hex");
const password = `${randomBytes(12).toString("base64url")}Aa1!`;
const MINUS = String.fromCharCode(0x2212);
const TIMES = String.fromCharCode(0xd7);
const route = "/games/math-tug-of-war/play";
const users = [];
const roomCodes = new Set();
const results = [];
const redact = (text) => String(text).split(bypass).join("[hidden]");
const ok = (condition, message) => {
  results.push(Boolean(condition));
  console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`);
  return Boolean(condition);
};

function parse(text) {
  const plain = text.split(MINUS).join("-").split(TIMES).join("*").trim();
  let match = /^What is the opposite of (-?\d+)\?$/.exec(plain);
  if (match) return { kind: "opposite", operands: [Number(match[1])], answer: Number(match[1]) === 0 ? 0 : -Number(match[1]) };
  match = /^\|(-?\d+)\|$/.exec(plain);
  if (match) return { kind: "absolute", operands: [Number(match[1])], answer: Math.abs(Number(match[1])) };
  match = /^(-?\d+) ([+*-]) (\((-\d+)\)|(\d+))$/.exec(plain);
  if (!match) throw new Error(`unrecognised question ${text}`);
  const a = Number(match[1]);
  const b = Number(match[4] ?? match[5]);
  const answer = match[2] === "+" ? a + b : match[2] === "-" ? a - b : a * b;
  return { kind: match[2], operands: [a, b], answer: answer === 0 ? 0 : answer };
}

const inRange = (values, min, max) => values.every((value) => Number.isInteger(value) && value >= min && value <= max);
function legal(skill, text) {
  const q = parse(text);
  const [a, b] = q.operands;
  switch (skill) {
    case "addition": return q.kind === "+" && inRange([a, b], 1, 12) && !text.includes("(");
    case "subtraction": return q.kind === "-" && inRange([a, b], 1, 12) && a >= b && q.answer >= 0;
    case "multiplication": return q.kind === "*" && inRange([a, b], 1, 12);
    case "integers": return (q.kind === "+" || q.kind === "-") && inRange([a, b], -12, 12) && (a < 0 || b < 0 || q.answer < 0) && (b >= 0 || text.includes(`(${MINUS}`));
    case "opposite": return q.kind === "opposite" && inRange([a], -12, 12);
    case "absolute": return q.kind === "absolute" && inRange([a], -12, 12) && q.answer >= 0;
    default: return false;
  }
}

async function subscriber(label) {
  const email = `tug-staging-${run}-${label}@example.invalid`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "math-tug-of-war-staging-review" } });
  if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  const id = made.data.user.id;
  users.push(id);
  const now = Date.now();
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: new Date(now).toISOString() }).eq("user_id", id);
  const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: id, entitlement_state: "subscription-active", current_period_ends_at: new Date(now + 20 * 86_400_000).toISOString() });
  if (account.error || entitlement.error) throw new Error("synthetic-entitlement-failed");
  return email;
}

async function session(engine, email, viewport, options = {}) {
  const context = await engine.newContext({
    viewport,
    extraHTTPHeaders: { "x-vercel-protection-bypass": bypass, "x-vercel-skip-toolbar": "1" },
    ...options
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`pageerror ${redact(error.message)}`));
  await page.goto(`${origin}/?x-vercel-protection-bypass=${bypass}&x-vercel-set-bypass-cookie=true`, { waitUntil: "domcontentloaded" });
  await page.goto(`${origin}/sign-in?next=${encodeURIComponent("/games")}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 45_000 });
  return { context, page };
}

async function openGame(page) {
  await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /Math Tug of War/ }).waitFor({ timeout: 45_000 });
}

async function start(page, mode, skill, names = { turquoise: "Sharks", pink: "Comets" }) {
  await openGame(page);
  await page.click(`button[data-mode=${mode}]`);
  if (mode === "teams") {
    await page.fill("#team-1-name", names.turquoise);
    await page.fill("#team-2-name", names.pink);
  } else await page.fill("#player-name", names.turquoise);
  await page.check(`#skill-${skill}`);
  await page.click(".setup-form button[type=submit]");
  await page.locator(".team-panel").first().waitFor();
}

const panel = (page, team) => page.locator(`.team-panel.team-${team}`);
const question = async (page, team) => (await panel(page, team).locator(".question-text").textContent()).trim();
const position = async (page) => Number(await page.locator(".tug-scene-svg").getAttribute("data-position"));
// The scene applies queued pulls one animation at a time; wait for the settled rope.
const settledAt = (page, value) => page.locator(`.tug-scene-svg[data-position="${value}"]`).waitFor({ timeout: 10_000 }).then(() => true, () => false);
async function unlocked(page, team) {
  await panel(page, team).locator(":scope:not([data-result])").waitFor({ timeout: 10_000 });
}
async function keys(page, team, list) {
  for (const key of list) await panel(page, team).locator(`.key[data-key="${key}"]`).click();
}
const keysFor = (value, plus = false) => (value < 0 ? ["-", ...String(-value)] : [...(plus ? ["+"] : []), ...String(value)]);
async function answer(page, team, { wrong = false, plus = false } = {}) {
  await unlocked(page, team);
  const text = await question(page, team);
  const value = parse(text).answer + (wrong ? 1 : 0);
  await keys(page, team, [...keysFor(value, plus && value > 0), "submit"]);
  return text;
}
async function metrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const keys = [...document.querySelectorAll(".key")].map((key) => key.getBoundingClientRect());
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      keysOut: keys.filter((box) => box.bottom > innerHeight + 0.5 || box.right > innerWidth + 0.5 || box.left < -0.5).length,
      minKey: keys.length ? [Math.round(Math.min(...keys.map((box) => box.width))), Math.round(Math.min(...keys.map((box) => box.height)))] : null,
      scene: (() => { const box = document.querySelector(".tug-scene-svg")?.getBoundingClientRect(); return box ? [Math.round(box.width), Math.round(box.height)] : null; })()
    };
  });
}
const shot = (page, name) => page.screenshot({ path: resolve(out, `${name}.png`) });

const browser = await chromium.launch();
const safari = await webkit.launch();
try {
  const health = await fetch(`${origin}/api/health`, { headers: { "x-vercel-protection-bypass": bypass } });
  const healthText = await health.text();
  ok(health.status === 200, `health 200 (${health.status})`);
  if (expectCommit) ok(healthText.includes(expectCommit.slice(0, 7)), `deployment serves commit ${expectCommit.slice(0, 7)}`);

  const emailA = await subscriber("a");
  const emailB = await subscriber("b");

  // ---- Math Games card and route
  const a = await session(browser, emailA, { width: 1366, height: 900 });
  await a.page.goto(`${origin}/games`, { waitUntil: "domcontentloaded" });
  const card = a.page.locator("article").filter({ has: a.page.getByRole("heading", { name: "Math Tug of War", exact: true }) });
  ok(await card.count() === 1, "Math Games card visible (exactly one)");
  await card.scrollIntoViewIfNeeded();
  const image = card.getByAltText("Math Tug of War gameplay artwork");
  await image.waitFor();
  await a.page.waitForFunction((element) => element.complete && element.naturalWidth > 0, await image.elementHandle());
  ok(await image.evaluate((element) => element.naturalWidth) === 1200, "thumbnail loaded (1200 px)");
  ok((await card.textContent()).includes("Solve the math. Pull the rope. Beat the other side!"), "card description");
  await shot(a.page, "01-math-games-card");
  await card.getByRole("link", { name: "Play" }).click();
  await a.page.getByRole("heading", { level: 1, name: /Math Tug of War/ }).waitFor({ timeout: 45_000 });
  ok(new URL(a.page.url()).pathname === route, `Play launches ${route}`);
  const response = await a.page.request.get(`${origin}${route}`);
  ok(response.status() === 200 && (response.headers()["content-security-policy"] ?? "").includes("connect-src 'self'"), "route 200 under the game CSP");
  await shot(a.page, "02-main-game-setup");

  // ---- Six skills (Two Teams): shapes, ranges, pulls, keypad signs
  for (const skill of ["addition", "subtraction", "multiplication", "integers", "opposite", "absolute"]) {
    await start(a.page, "teams", skill);
    const signed = ["integers", "opposite", "absolute"].includes(skill);
    ok(await panel(a.page, "turquoise").locator('.key[data-key="-"]').count() === (signed ? 1 : 0), `${skill}: sign keys ${signed ? "shown" : "hidden"}`);
    let legalCount = 0;
    let seen = 0;
    for (let turn = 0; turn < 8; turn += 1) {
      const team = turn % 2 ? "pink" : "turquoise";
      await unlocked(a.page, team);
      const text = await question(a.page, team);
      seen += 1;
      if (legal(skill, text)) legalCount += 1;
      else console.log(`  illegal ${skill} question: ${text}`);
      await answer(a.page, team, { plus: signed && turn === 0 });
    }
    ok(legalCount === seen, `${skill}: ${seen} staging questions all within the exact V1 ranges`);
    ok(await settledAt(a.page, 0), `${skill}: alternating correct pulls keep the rope centred`);
    await unlocked(a.page, "turquoise");
    await answer(a.page, "turquoise", { wrong: true });
    await a.page.waitForTimeout(1_200);
    ok(await position(a.page) === 0, `${skill}: wrong answer does not pull`);
    await unlocked(a.page, "turquoise");
    await answer(a.page, "turquoise");
    ok(await settledAt(a.page, -1), `${skill}: correct Turquoise answer pulls`);
    await shot(a.page, `skill-${skill}`);
  }

  // ---- Keypad
  await start(a.page, "teams", "integers");
  const display = panel(a.page, "turquoise").locator(".answer-value");
  await keys(a.page, "turquoise", ["-", "-"]);
  ok(await display.textContent() === "?", "keypad: double minus cancels (no --)");
  await keys(a.page, "turquoise", ["-", "7", "-", "+"]);
  ok(await display.textContent() === `${MINUS}7`, "keypad: minus then 7 shows −7; signs after digits rejected");
  await shot(a.page, "21-signed-number-keypad");
  await keys(a.page, "turquoise", ["clear"]);
  ok(await display.textContent() === "?", "keypad: Clear");
  await keys(a.page, "turquoise", ["submit"]);
  ok(await panel(a.page, "turquoise").getAttribute("data-feedback") === "hint", "keypad: empty Submit refused");
  for (const digit of "0123456789") await keys(a.page, "turquoise", [digit, "clear"]);
  ok(true, "keypad: 0–9 keys respond");

  // ---- Two Teams: simultaneous touch, both pulls, victory
  await start(a.page, "teams", "multiplication");
  await a.page.evaluate(() => {
    const press = (team, key, id) => document.querySelector(`.team-panel.team-${team} .key[data-key="${key}"]`).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch", pointerId: id }));
    press("turquoise", "4", 21);
    press("pink", "7", 22);
  });
  ok(await panel(a.page, "turquoise").locator(".answer-value").textContent() === "4" && await panel(a.page, "pink").locator(".answer-value").textContent() === "7", "Two Teams: simultaneous touches land on their own side");
  await keys(a.page, "turquoise", ["clear"]);
  await keys(a.page, "pink", ["clear"]);
  await answer(a.page, "pink");
  await a.page.waitForTimeout(150);
  ok(await position(a.page) === 1, "Two Teams: Pink pull");
  await a.page.waitForTimeout(250);
  await shot(a.page, "09-pink-successful-pull");
  for (let pull = 0; pull < 6; pull += 1) await answer(a.page, "turquoise");
  const dialog = a.page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Sharks WINS!" }).waitFor({ timeout: 10_000 });
  ok(await position(a.page) === -5, "Two Teams: Turquoise victory at the line");
  await a.page.waitForTimeout(600);
  await shot(a.page, "13-turquoise-victory");
  await dialog.getByRole("button", { name: "Play Again" }).click();
  ok(await position(a.page) === 0, "Play Again resets the rope");

  // ---- Smart Board 1920x1080
  const board = await session(browser, emailB, { width: 1920, height: 1080 });
  await start(board.page, "teams", "integers");
  const boardMetrics = await metrics(board.page);
  ok(boardMetrics.overflowX <= 0 && boardMetrics.keysOut === 0 && boardMetrics.minKey[0] >= 100 && boardMetrics.minKey[1] >= 100, `Smart Board 1920x1080: no overflow, large keys ${JSON.stringify(boardMetrics.minKey)}, scene ${JSON.stringify(boardMetrics.scene)}`);
  await shot(board.page, "07-smart-board-gameplay");
  await answer(board.page, "turquoise");
  await board.page.waitForTimeout(260);
  await shot(board.page, "08-turquoise-successful-pull");
  await board.context.close();

  // ---- VS Robot (phone widths) incl. victory
  for (const width of [320, 375, 390, 430]) {
    const phone = await session(browser, emailA, { width, height: width === 320 ? 568 : 844 }, { hasTouch: true, isMobile: true });
    await start(phone.page, "robot", "addition", { turquoise: "Ava" });
    const robotMetrics = await metrics(phone.page);
    ok(robotMetrics.overflowX <= 0 && robotMetrics.keysOut === 0, `phone ${width}: VS Robot fits ${JSON.stringify(robotMetrics)}`);
    if (width === 390) {
      await answer(phone.page, "turquoise", { wrong: true });
      await phone.page.waitForTimeout(400);
      ok(await position(phone.page) >= 0, "VS Robot: wrong answer does not pull");
      await phone.page.locator(".robot-status").filter({ hasText: /Pulled!|Missed one/ }).waitFor({ timeout: 15_000 });
      ok(true, "VS Robot: robot thinks, then answers");
      for (let pull = 0; pull < 12 && !(await phone.page.getByRole("dialog").count()); pull += 1) await answer(phone.page, "turquoise").catch(() => undefined);
      await phone.page.getByRole("dialog").getByRole("heading", { name: /WINS!/ }).waitFor({ timeout: 15_000 });
      ok(true, "VS Robot: victory");
      await shot(phone.page, "22-phone-vs-robot");
    }
    await start(phone.page, "teams", "integers");
    const teamsMetrics = await metrics(phone.page);
    ok(teamsMetrics.overflowX <= 0 && teamsMetrics.keysOut === 0 && teamsMetrics.minKey[0] >= 40, `phone ${width}: Two Teams fallback fits ${JSON.stringify(teamsMetrics)}`);
    await phone.context.close();
  }

  // ---- iPad
  const ipad = await session(safari, emailB, { width: 820, height: 1180 }, { hasTouch: true });
  await start(ipad.page, "teams", "opposite");
  const ipadMetrics = await metrics(ipad.page);
  ok(ipadMetrics.overflowX <= 0 && ipadMetrics.keysOut === 0, `iPad (WebKit) Two Teams fits ${JSON.stringify(ipadMetrics)}`);
  await answer(ipad.page, "pink");
  await ipad.page.waitForTimeout(150);
  ok(await position(ipad.page) === 1, "iPad (WebKit): Pink pull");
  await shot(ipad.page, "24-ipad-two-teams");
  await ipad.context.close();

  // ---- Reduced motion
  const calm = await session(browser, emailA, { width: 1366, height: 768 }, { reducedMotion: "reduce" });
  await start(calm.page, "teams", "addition");
  await answer(calm.page, "turquoise");
  await calm.page.waitForTimeout(100);
  ok(await position(calm.page) === -1 && (await calm.page.locator(".scene-status").textContent()) === "Sharks pulled!", "reduced motion: pull and status still shown");
  await shot(calm.page, "25-reduced-motion");
  await calm.context.close();

  // ---- Online Match: two real browser sessions (phone size), Chromium + WebKit
  const hostPhone = await session(browser, emailA, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const guestPhone = await session(safari, emailB, { width: 390, height: 844 }, { hasTouch: true });
  await openGame(hostPhone.page);
  await hostPhone.page.click("button[data-mode=online]");
  await hostPhone.page.click("button[data-online=create]");
  await hostPhone.page.fill("#online-name", "Ava");
  await hostPhone.page.check("#skill-integers");
  await hostPhone.page.click(".setup-form button[type=submit]");
  await hostPhone.page.getByText("Waiting for opponent…").waitFor({ timeout: 20_000 });
  const code = (await hostPhone.page.locator(".code-letter").allTextContents()).join("");
  roomCodes.add(code);
  ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code), "Online: room created with a 5-character code");
  await shot(hostPhone.page, "05-online-create-game-room-code");
  await openGame(guestPhone.page);
  await guestPhone.page.click("button[data-mode=online]");
  await guestPhone.page.click("button[data-online=join]");
  await guestPhone.page.fill("#online-name", "Bo");
  await guestPhone.page.fill("#room-code", code.toLowerCase());
  await guestPhone.page.click(".setup-form button[type=submit]");
  await guestPhone.page.getByRole("heading", { name: "Both players ready" }).waitFor({ timeout: 20_000 });
  ok(true, "Online: guest joined (WebKit), both players ready");
  await shot(guestPhone.page, "06-online-join-game-ready");
  await panel(hostPhone.page, "turquoise").waitFor({ timeout: 20_000 });
  await panel(guestPhone.page, "pink").waitFor({ timeout: 20_000 });
  const waitPosition = async (page, value) => page.locator(`.tug-scene-svg[data-position="${value}"]`).waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await answer(hostPhone.page, "turquoise");
  ok(await waitPosition(guestPhone.page, -1), "Online: host pull reaches the guest");
  await answer(guestPhone.page, "pink");
  ok(await waitPosition(hostPhone.page, 0), "Online: guest pull reaches the host");
  await unlocked(hostPhone.page, "turquoise");
  await unlocked(guestPhone.page, "pink");
  const va = parse(await question(hostPhone.page, "turquoise")).answer;
  const vb = parse(await question(guestPhone.page, "pink")).answer;
  await keys(hostPhone.page, "turquoise", keysFor(va));
  await keys(guestPhone.page, "pink", keysFor(vb));
  await Promise.all([keys(hostPhone.page, "turquoise", ["submit"]), keys(guestPhone.page, "pink", ["submit"])]);
  await hostPhone.page.waitForTimeout(2_500);
  const room = await admin.from("tug_rooms").select("position,host_pulls,guest_pulls").eq("code", code).in("status", ["playing", "won"]).single();
  ok(room.data?.host_pulls === 2 && room.data?.guest_pulls === 2 && room.data?.position === 0, `Online: simultaneous answers both counted ${JSON.stringify(room.data)}`);
  ok(await waitPosition(hostPhone.page, 0) && await waitPosition(guestPhone.page, 0), "Online: both screens show the same rope");
  await shot(guestPhone.page, "23-phone-online-match-pink");
  await shot(hostPhone.page, "23b-phone-online-match-turquoise");
  await guestPhone.context.setOffline(true);
  const reconnecting = await hostPhone.page.locator('.opponent-card .connection[data-presence="reconnecting"]').waitFor({ timeout: 25_000 }).then(() => true, () => false);
  ok(reconnecting, "Online: opponent drop shows Reconnecting…");
  await guestPhone.context.setOffline(false);
  const back = await hostPhone.page.locator('.opponent-card .connection[data-presence="connected"]').waitFor({ timeout: 25_000 }).then(() => true, () => false);
  ok(back, "Online: reconnect restores the match");
  for (let pull = 1; pull <= 5; pull += 1) {
    await answer(hostPhone.page, "turquoise");
    await waitPosition(hostPhone.page, -pull);
  }
  const hostWin = await hostPhone.page.getByRole("dialog").getByRole("heading", { name: "Ava WINS!" }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const guestWin = await guestPhone.page.getByRole("dialog").getByRole("heading", { name: "Ava WINS!" }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok(hostWin && guestWin, "Online: win synchronized on both phones");
  await hostPhone.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  await guestPhone.page.locator(".rematch-status").filter({ hasText: "wants a rematch" }).waitFor({ timeout: 15_000 });
  await guestPhone.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  ok(await waitPosition(hostPhone.page, 0) && await waitPosition(guestPhone.page, 0), "Online: rematch resets both phones");
  await guestPhone.page.getByRole("button", { name: "Exit to game setup" }).click();
  const leftSeen = await hostPhone.page.getByRole("dialog").getByText("Bo left the match.").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok(leftSeen, "Online: leaving ends the match for the other phone (no fake win)");
  await hostPhone.context.close();
  await guestPhone.context.close();
  await a.context.close();
} finally {
  for (const code of roomCodes) await admin.from("tug_rooms").delete().eq("code", code);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await browser.close();
  await safari.close();
  const passed = results.filter(Boolean).length;
  console.log(`\nREVIEW ${passed}/${results.length} passed; synthetic users deleted: ${users.length}; rooms removed: ${roomCodes.size}`);
  if (passed !== results.length || results.length === 0) process.exitCode = 1;
}
