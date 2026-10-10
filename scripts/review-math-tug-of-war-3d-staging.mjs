/**
 * Math Tug of War 3D — real-browser review of a STAGING deployment.
 *
 * Launched by scripts/invoke-math-tug-of-war-staging.ps1 -Stage review-3d
 * -Origin <staging preview URL> [-ExpectCommit <sha>], which supplies the
 * staging Supabase secret key and the Vercel protection-bypass entry (the
 * value travels only in request headers/cookie and is never printed). The
 * classic review (-Stage review) certifies the game itself; this one proves
 * the 3D layer on the hosted build:
 *
 *   - the deployed runtime is the tested source (runtime content hash in the
 *     document, byte-identical models and vendored three.js, commit in /api/health);
 *   - the route CSP is unchanged and the models load under it;
 *   - the 3D scene starts on hardware GL, mirrors every pull, celebrates only
 *     the confirmed winner, and the toggle / reduced motion fall back to classic;
 *   - phone, Smart Board, iPad and WebKit renders;
 *   - an Online Match with the 3D scene on both clients (Chromium host,
 *     WebKit guest) stays in step with the room state.
 *
 * Two synthetic subscriber accounts are created on STAGING and deleted at the
 * end, with every room they opened. Output: owner-review/math-tug-of-war-3d-v1/staging/.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { runtimeHash } from "./math-tug-of-war-runtime-hash.mjs";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (!/^[A-Za-z0-9_-]{20,}$/.test(bypass)) throw new Error("missing protection-bypass entry");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
if (secretKey.length < 20) throw new Error("missing secret key");
const expectCommit = (process.env.EXPECT_COMMIT ?? "").trim();
const out = resolve(process.env.REVIEW_OUT ?? "owner-review/math-tug-of-war-3d-v1/staging");
mkdirSync(out, { recursive: true });
const bypassHeaders = { "x-vercel-protection-bypass": bypass, "x-vercel-skip-toolbar": "1" };
const landing = `${origin}/?x-vercel-protection-bypass=${bypass}&x-vercel-set-bypass-cookie=true`;
const GPU_ARGS = ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
const ASSET_BASE = "/internal-games/math-tug-of-war/";
const localRuntime = resolve("apps/platform-web/public/internal-games/math-tug-of-war");

const admin = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomBytes(3).toString("hex");
const password = `${randomBytes(12).toString("base64url")}Aa1!`;
const MINUS = String.fromCharCode(0x2212);
const TIMES = String.fromCharCode(0xd7);
const route = "/games/math-tug-of-war/play";
const users = [];
const roomCodes = new Set();
const reviewStartedAt = new Date(Date.now() - 60_000).toISOString();
const results = [];
const evidence = { origin, commit: expectCommit || null, checks: [], measurements: [] };
const redact = (text) => String(text).split(bypass).join("[hidden]");
const ok = (condition, message) => {
  results.push(Boolean(condition));
  evidence.checks.push({ ok: Boolean(condition), message: redact(message) });
  console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`);
  return Boolean(condition);
};

function solve(text) {
  const plain = text.split(MINUS).join("-").split(TIMES).join("*").trim();
  const binary = /^(-?\d+) ([+*-]) (\((-\d+)\)|(\d+))$/.exec(plain);
  if (!binary) throw new Error(`unrecognised question ${text}`);
  const a = Number(binary[1]);
  const b = Number(binary[4] ?? binary[5]);
  const value = binary[2] === "+" ? a + b : binary[2] === "-" ? a - b : a * b;
  return value === 0 ? 0 : value;
}

async function subscriber(label) {
  const email = `tug-3d-staging-${run}-${label}@example.invalid`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "math-tug-of-war-3d-staging-review" } });
  if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  const id = made.data.user.id;
  users.push(id);
  const now = Date.now();
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: new Date(now).toISOString() }).eq("user_id", id);
  const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: id, entitlement_state: "subscription-active", current_period_ends_at: new Date(now + 20 * 86_400_000).toISOString() });
  if (account.error || entitlement.error) throw new Error("synthetic-entitlement-failed");
  return email;
}

/** A signed-in session; `graphics` is the review override ("3d", "classic" or null for the real device path). */
async function session(engine, email, viewport, { graphics = "3d", ...options } = {}) {
  const context = await engine.newContext({ viewport, extraHTTPHeaders: bypassHeaders, ...options });
  if (graphics) {
    await context.addInitScript((value) => {
      window.__MATHNEXA_GRAPHICS__ = value;
    }, graphics);
  }
  const page = await context.newPage();
  const errors = [];
  // Preview-protection noise (Next's route prefetches refused by the SSO layer) is not the game's.
  const noise = (text) => /favicon|_rsc=|access control checks|Failed to load resource/i.test(text);
  page.on("pageerror", (error) => {
    if (!noise(error.message)) errors.push(redact(error.message));
  });
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !noise(message.text())) errors.push(`${message.type()}: ${redact(message.text())}`);
  });
  await page.goto(landing, { waitUntil: "domcontentloaded" });
  await page.goto(`${origin}/sign-in?next=${encodeURIComponent(route)}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 45_000 });
  return { context, page, errors };
}

async function openGame(page) {
  await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /Math Tug of War/ }).waitFor({ timeout: 45_000 });
}

async function startTeams(page, skill = "addition") {
  await openGame(page);
  await page.click("button[data-mode=teams]");
  await page.fill("#team-1-name", "Sharks");
  await page.fill("#team-2-name", "Comets");
  await page.check(`#skill-${skill}`);
  await page.click(".setup-form button[type=submit]");
  await page.locator(".team-panel").first().waitFor();
}

const panel = (page, team) => page.locator(`.team-panel.team-${team}`);
const question = async (page, team) => (await panel(page, team).locator(".question-text").textContent()).trim();
const svgPosition = async (page) => Number(await page.locator(".tug-scene-svg").getAttribute("data-position"));
const settledAt = (page, value) => page.locator(`.tug-scene-svg[data-position="${value}"]`).waitFor({ timeout: 10_000 }).then(() => true, () => false);
async function unlocked(page, team) {
  await panel(page, team).locator(":scope:not([data-result])").waitFor({ timeout: 10_000 });
}
async function keys(page, team, list) {
  for (const key of list) await panel(page, team).locator(`.key[data-key="${key}"]`).click();
}
const keysFor = (value) => (value < 0 ? ["-", ...String(-value)] : [...String(value)]);
async function answer(page, team, { wrong = false } = {}) {
  await unlocked(page, team);
  const value = solve(await question(page, team)) + (wrong ? 1 : 0);
  await keys(page, team, [...keysFor(value), "submit"]);
}
const snapshot = (page) => page.evaluate(() => {
  const scene = window.__MATHNEXA_TUG_SCENE__;
  return scene ? scene.snapshot() : null;
});
async function waitForRenderer(page, renderer, timeout = 60_000) {
  return page.locator(`.scene-stage[data-renderer="${renderer}"]`).waitFor({ timeout }).then(() => true, () => false);
}
async function waitFor3DPosition(page, value) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const snap = await snapshot(page);
    if (snap?.three?.position === value) return true;
    await page.waitForTimeout(100);
  }
  return false;
}
async function metrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const keys = [...document.querySelectorAll(".key")].map((key) => key.getBoundingClientRect());
    const canvas = document.querySelector("canvas.tug-scene-3d");
    const svg = document.querySelector(".tug-scene-svg")?.getBoundingClientRect();
    const stage = document.querySelector(".scene-stage")?.getBoundingClientRect();
    const questions = [...document.querySelectorAll(".question")].map((node) => node.getBoundingClientRect());
    const overlaps = stage ? questions.filter((q) => !(q.right <= stage.left || q.left >= stage.right || q.bottom <= stage.top || q.top >= stage.bottom)).length : 0;
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      keysOut: keys.filter((box) => box.bottom > innerHeight + 0.5 || box.right > innerWidth + 0.5 || box.left < -0.5).length,
      minKey: keys.length ? [Math.round(Math.min(...keys.map((box) => box.width))), Math.round(Math.min(...keys.map((box) => box.height)))] : null,
      canvas: canvas ? [canvas.width, canvas.height, Math.round(canvas.clientWidth), Math.round(canvas.clientHeight)] : null,
      svg: svg ? [Math.round(svg.width), Math.round(svg.height)] : null,
      questionOverlaps: overlaps
    };
  });
}
const shot = (page, name) => page.screenshot({ path: resolve(out, `${name}.png`) });
function record(label, snap, extra = {}) {
  const three = snap?.three;
  if (!three) return;
  evidence.measurements.push({ label, tier: three.tier, frameMs: three.frameMs, worstMs: three.worstMs, drawCalls: three.drawCalls, triangles: three.triangles, pixelRatio: three.pixelRatio, reachMiss: three.reachMiss, downgrades: three.downgrades, ...extra });
}

const browser = await chromium.launch({ args: GPU_ARGS });
const software = await chromium.launch();
const safari = await webkit.launch();
try {
  // ---- The deployed build is the tested source.
  const health = await fetch(`${origin}/api/health`, { headers: bypassHeaders });
  const healthText = await health.text();
  ok(health.status === 200, `health 200 (${health.status})`);
  if (expectCommit) ok(healthText.includes(expectCommit.slice(0, 7)), `deployment serves commit ${expectCommit.slice(0, 7)}`);
  const localHash = runtimeHash().slice(0, 16);
  const subscriberEmail = await subscriber("a");
  const guestEmail = await subscriber("b");
  const probe = await session(browser, subscriberEmail, { width: 1366, height: 900 });
  const document = await probe.page.request.get(`${origin}${route}`);
  const html = await document.text();
  const csp = document.headers()["content-security-policy"] ?? "";
  const served = /src\/app\.js\?v=([0-9a-f]{16})/.exec(html)?.[1] ?? null;
  ok(document.status() === 200 && served === localHash, `game document versions its runtime with the tested content hash ${localHash} (served ${served})`);
  ok(/default-src 'none'/.test(csp) && /script-src 'self'/.test(csp) && /connect-src 'self'/.test(csp) && /worker-src 'none'/.test(csp) && /img-src 'self' data: blob:/.test(csp), `route CSP unchanged (${csp.slice(0, 90)}…)`);
  const assets = [
    ["models/characters.gltf", /json/],
    ["models/characters.bin", /octet-stream/],
    ["src/vendor/three.js", /javascript/],
    ["src/scene3d/scene3d.js", /javascript/],
    ["src/scene3d/puller.js", /javascript/]
  ];
  const mismatched = [];
  for (const [file, type] of assets) {
    const response = await probe.page.request.get(`${origin}${ASSET_BASE}${file}?v=${localHash}`);
    const body = await response.body();
    const local = readFileSync(resolve(localRuntime, file));
    const same = response.status() === 200 && type.test(response.headers()["content-type"] ?? "") && body.length === local.length && body.equals(local);
    if (!same) mismatched.push(`${file}:${response.status()}:${body.length}/${local.length}`);
  }
  ok(mismatched.length === 0, `models, vendored three.js and the 3D modules are byte-identical to the tested source (${assets.length} files) ${mismatched.join(" ")}`);
  const texture = /"uri"\s*:\s*"([^"]+\.webp)"/.exec(readFileSync(resolve(localRuntime, "models/characters.gltf"), "utf8"))?.[1];
  if (texture) {
    const webp = await probe.page.request.get(`${origin}${ASSET_BASE}models/${texture}?v=${localHash}`);
    ok(webp.status() === 200 && /image\/webp/.test(webp.headers()["content-type"] ?? "") && (await webp.body()).length === statSync(resolve(localRuntime, "models", texture)).size, `character textures served as image/webp (${texture})`);
  }

  // ---- Desktop 1366×900 with the 3D scene: mirrors pulls, celebrates the confirmed winner, toggles.
  await startTeams(probe.page, "multiplication");
  ok(await waitForRenderer(probe.page, "3d", 90_000), "desktop: 3D scene renders on the hosted build (models loaded under the route CSP)");
  await probe.page.waitForTimeout(1_200);
  let snap = await snapshot(probe.page);
  ok(snap?.three?.ready === true && snap.three.shadows === true && ["medium", "high"].includes(snap.three.tier), `desktop: tier ${snap?.three?.tier}, shadow maps ${snap?.three?.shadows}, ${snap?.three?.drawCalls} draw calls`);
  await shot(probe.page, "30-staging-3d-desktop-start");
  await answer(probe.page, "turquoise");
  ok(await settledAt(probe.page, -1) && await waitFor3DPosition(probe.page, -1), "desktop: Turquoise pull mirrored by the 3D scene (−1 in both layers)");
  await probe.page.waitForTimeout(250);
  snap = await snapshot(probe.page);
  ok((snap?.three?.reachMiss ?? 1) < 0.03 && snap.three.states.turquoise.some((state) => ["pulling", "ready"].includes(state)), `desktop: hands hold the rope mid-heave (reach miss ${snap?.three?.reachMiss} m)`);
  await shot(probe.page, "31-staging-3d-desktop-pull");
  await answer(probe.page, "pink", { wrong: true });
  await probe.page.waitForTimeout(1_200);
  ok(await svgPosition(probe.page) === -1 && (await snapshot(probe.page)).three.position === -1, "desktop: wrong answer moves neither layer");
  for (let pull = 2; pull <= 7; pull += 1) {
    await answer(probe.page, "turquoise");
    await settledAt(probe.page, -pull);
    if (pull < 7) ok((await snapshot(probe.page)).three.winner === null, `desktop: no celebration before the win (pull ${pull})`);
  }
  const won = await probe.page.getByRole("dialog").getByRole("heading", { name: "Sharks WINS!" }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await probe.page.waitForTimeout(1_400);
  snap = await snapshot(probe.page);
  ok(won && snap.three.winner === "turquoise" && snap.three.states.turquoise.every((state) => state === "celebrate") && snap.three.states.pink.every((state) => ["falling", "down", "rising", "dejected"].includes(state)), `desktop: winners celebrate and losers fall only after the confirmed win (${JSON.stringify(snap.three.states)})`);
  await shot(probe.page, "32-staging-3d-desktop-victory");
  record("staging desktop 1366x900", snap, { canvas: (await metrics(probe.page)).canvas });
  await probe.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  ok(await settledAt(probe.page, 0) && await waitFor3DPosition(probe.page, 0), "desktop: Play Again resets both layers");
  const toggle = probe.page.locator('[data-action="graphics"]');
  await toggle.click();
  ok(await waitForRenderer(probe.page, "svg", 10_000) && await probe.page.locator("canvas.tug-scene-3d").count() === 0, "desktop: 3D toggle shows the classic scene (canvas removed)");
  await answer(probe.page, "pink");
  ok(await settledAt(probe.page, 1), "desktop: classic scene still plays after the toggle");
  await toggle.click();
  ok(await waitForRenderer(probe.page, "3d", 60_000) && await waitFor3DPosition(probe.page, 1), "desktop: toggling back rebuilds the 3D scene at the live position");
  ok(probe.errors.length === 0, `desktop: no page errors or console errors (${probe.errors.length}) ${probe.errors.slice(0, 3).join(" | ")}`);
  await probe.context.close();

  // ---- The real device path (no override): hardware GL picks 3D, reduced motion picks classic, software GL picks classic.
  {
    const auto = await session(browser, subscriberEmail, { width: 1366, height: 900 }, { graphics: null });
    await startTeams(auto.page);
    ok(await waitForRenderer(auto.page, "3d", 90_000), "auto: a hardware-GL browser gets the 3D scene without any override");
    await auto.context.close();
    const calm = await session(browser, subscriberEmail, { width: 1366, height: 900 }, { graphics: null, reducedMotion: "reduce" });
    await startTeams(calm.page);
    ok(await waitForRenderer(calm.page, "svg", 10_000) && await calm.page.locator("canvas").count() === 0 && await calm.page.locator('[data-action="graphics"]').isDisabled(), "auto: reduced motion keeps the classic scene and disables the toggle");
    await calm.context.close();
    const soft = await session(software, subscriberEmail, { width: 1366, height: 900 }, { graphics: null });
    await startTeams(soft.page);
    await soft.page.waitForTimeout(2_500);
    ok(await waitForRenderer(soft.page, "svg", 5_000) && await soft.page.locator("canvas").count() === 0, "auto: software GL (no hardware acceleration) keeps the classic scene");
    await answer(soft.page, "turquoise");
    ok(await settledAt(soft.page, -1), "auto: the classic scene still plays on software GL");
    await soft.context.close();
  }

  // ---- Phone 390×844, Smart Board 1920×1080, iPad (WebKit), WebKit desktop.
  for (const [name, engine, viewport, options] of [
    ["phone-390x844", browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 3 }],
    ["phone-430x932", browser, { width: 430, height: 932 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 3 }],
    ["smart-board-1920x1080", browser, { width: 1920, height: 1080 }, {}],
    ["ipad-820x1180-webkit", safari, { width: 820, height: 1180 }, { hasTouch: true }],
    ["webkit-desktop-1366x768", safari, { width: 1366, height: 768 }, {}]
  ]) {
    const device = await session(engine, subscriberEmail, viewport, options);
    await startTeams(device.page, "integers");
    const rendered = await waitForRenderer(device.page, "3d", 90_000);
    await device.page.waitForTimeout(1_000);
    await answer(device.page, "pink");
    await settledAt(device.page, 1);
    await device.page.waitForTimeout(900);
    const m = await metrics(device.page);
    const s = await snapshot(device.page);
    ok(rendered && s?.three?.position === 1 && m.overflowX <= 0 && m.keysOut === 0 && m.questionOverlaps === 0 && m.canvas && Math.abs(m.canvas[2] - m.svg[0]) <= 1.5, `${name}: 3D scene (tier ${s?.three?.tier}) at ${m.canvas?.[0]}×${m.canvas?.[1]} px, pull mirrored, no overflow, keys fit ${JSON.stringify(m.minKey)}, scene never covers a question`);
    record(`staging ${name}`, s, { canvas: m.canvas });
    await shot(device.page, `33-staging-3d-${name}`);
    await device.context.close();
  }

  // ---- Online Match with the 3D scene on both clients: Chromium host, WebKit guest.
  const host = await session(browser, subscriberEmail, { width: 1366, height: 900 });
  const guest = await session(safari, guestEmail, { width: 1366, height: 900 });
  await openGame(host.page);
  await host.page.click("button[data-mode=online]");
  await host.page.click("button[data-online=create]");
  await host.page.fill("#online-name", "Avi");
  await host.page.check("#skill-addition");
  await host.page.click(".setup-form button[type=submit]");
  await host.page.getByText("Waiting for opponent…").waitFor({ timeout: 20_000 });
  const code = (await host.page.locator(".code-letter").allTextContents()).join("");
  roomCodes.add(code);
  await openGame(guest.page);
  await guest.page.click("button[data-mode=online]");
  await guest.page.click("button[data-online=join]");
  await guest.page.fill("#online-name", "Bo");
  await guest.page.fill("#room-code", code);
  await guest.page.click(".setup-form button[type=submit]");
  await panel(host.page, "turquoise").waitFor({ timeout: 20_000 });
  await panel(guest.page, "pink").waitFor({ timeout: 20_000 });
  ok(await waitForRenderer(host.page, "3d", 90_000) && await waitForRenderer(guest.page, "3d", 90_000), "online 3D: both clients (Chromium host, WebKit guest) render the 3D scene");
  await answer(host.page, "turquoise");
  ok(await settledAt(guest.page, -1) && await waitFor3DPosition(guest.page, -1) && await waitFor3DPosition(host.page, -1), "online 3D: host pull moves both 3D scenes to −1");
  await answer(guest.page, "pink");
  ok(await settledAt(host.page, 0) && await waitFor3DPosition(host.page, 0) && await waitFor3DPosition(guest.page, 0), "online 3D: guest pull moves both 3D scenes back to 0");
  await host.page.waitForTimeout(400);
  await shot(host.page, "34-staging-3d-online-host");
  await shot(guest.page, "34b-staging-3d-online-guest-webkit");
  for (let pull = 1; pull <= 7; pull += 1) {
    await answer(host.page, "turquoise");
    await settledAt(host.page, -pull);
  }
  const hostWin = await host.page.getByRole("dialog").getByRole("heading", { name: "Avi WINS!" }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const guestWin = await guest.page.getByRole("dialog").getByRole("heading", { name: "Avi WINS!" }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await host.page.waitForTimeout(1_400);
  const hostSnap = await snapshot(host.page);
  const guestSnap = await snapshot(guest.page);
  ok(hostWin && guestWin && hostSnap?.three?.winner === "turquoise" && guestSnap?.three?.winner === "turquoise" && hostSnap.three.states.turquoise.every((state) => state === "celebrate") && guestSnap.three.states.turquoise.every((state) => state === "celebrate"), `online 3D: both 3D scenes celebrate the same confirmed winner (${JSON.stringify(hostSnap?.three?.states)} / ${JSON.stringify(guestSnap?.three?.states)})`);
  await shot(host.page, "35-staging-3d-online-victory-host");
  await shot(guest.page, "35b-staging-3d-online-victory-guest-webkit");
  const room = await admin.from("tug_rooms").select("position,host_pulls,guest_pulls,status").eq("code", code).single();
  ok(room.data?.position === -7 && room.data?.host_pulls === 8 && room.data?.guest_pulls === 1, `online 3D: the database agrees with both screens ${JSON.stringify(room.data)}`);
  await host.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  await guest.page.locator(".rematch-status").filter({ hasText: "wants a rematch" }).waitFor({ timeout: 15_000 });
  await guest.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  ok(await settledAt(host.page, 0) && await settledAt(guest.page, 0) && await waitFor3DPosition(host.page, 0) && await waitFor3DPosition(guest.page, 0) && (await snapshot(guest.page)).three.winner === null, "online 3D: rematch resets both 3D scenes");
  await guest.page.getByRole("button", { name: "Exit to game setup" }).click();
  const leftSeen = await host.page.getByRole("dialog").getByText("Bo left the match.").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok(leftSeen && (await snapshot(host.page)).three.winner === null, "online 3D: leaving ends the match with no celebration on the other screen");
  ok(host.errors.length === 0 && guest.errors.length === 0, `online 3D: no page errors on either client (${host.errors.length}/${guest.errors.length}) ${[...host.errors, ...guest.errors].slice(0, 4).join(" | ")}`);
  await host.context.close();
  await guest.context.close();
} finally {
  for (const code of roomCodes) await admin.from("tug_rooms").delete().eq("code", code).gte("created_at", reviewStartedAt);
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await browser.close();
  await software.close();
  await safari.close();
  const passed = results.filter(Boolean).length;
  evidence.summary = { passed, total: results.length, syntheticUsersDeleted: users.length, roomsRemoved: roomCodes.size };
  writeFileSync(resolve(out, "staging-3d-results.json"), JSON.stringify(evidence, null, 2));
  console.log(`\nREVIEW-3D ${passed}/${results.length} passed; synthetic users deleted: ${users.length}; rooms removed: ${roomCodes.size}`);
  if (passed !== results.length || results.length === 0) process.exitCode = 1;
}
