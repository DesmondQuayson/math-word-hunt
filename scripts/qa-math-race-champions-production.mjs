/**
 * Math Race Champions — guest QA of a deployed site, with no account and no
 * password.
 *
 *   PRODUCTION  scripts/invoke-math-race-champions-production.ps1 -Stage qa
 *               (loads only the production project ref and service key);
 *               runs against https://mathnexa.com.
 *   STAGING     scripts/invoke-math-race-champions-staging.ps1 -Stage qa
 *               -Origin <preview URL>: the same checks against a protected
 *               staging preview, as a rehearsal.
 *
 * What it does:
 *   - health and build; the public pages; the homepage Free math games card at
 *     five screen sizes; the /math-games catalog; signed-out access;
 *   - every runtime file of the game, the 3D code, the synthesiser and the
 *     music track are served; the served question engine asks conversions in
 *     words;
 *   - an Online Race in a synthetic room: the creator's side through the
 *     room's own service-role functions, every guest through the public
 *     endpoints (two real phone browsers, by QR link and by typed code at
 *     /join, plus plain HTTP racers). Conversion wording on screen, music and
 *     racing sound state, progress, minimap, leaderboard, reconnect, and a
 *     server-decided finish with 30 correct answers or more.
 * Every synthetic room is deleted at the end. Signed-in flows (Classroom,
 * Computer Race, the garage, the wallet) are verified separately with the
 * owner's own sign-in.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, devices, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { parseConversion } from "../apps/platform-web/public/internal-games/math-race-champions/src/engine/questions.js";
import { MIN_CORRECT, ONLINE_CAR, newRacerState } from "../apps/platform-web/public/internal-games/math-race-champions/src/engine/race.js";
import { HttpRacer, solveQuestion } from "./math-race-champions-racer.mjs";
import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const stagingOrigin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
const STAGING = stagingOrigin !== "";
let origin;
let supabaseUrl;
let secretKey;
let protection = null;
if (STAGING) {
  if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(stagingOrigin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
  for (const name of Object.keys(process.env)) if (/_LIVE_|_PRODUCTION_|_READONLY_/.test(name)) throw new Error(`refusing: ${name} is present in this process`);
  origin = stagingOrigin;
  supabaseUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
  secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  protection = createProtectionBypass({ origin, secret: (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim() });
  if (!protection.enabled) throw new Error("missing staging protection-bypass entry");
} else {
  origin = "https://mathnexa.com";
  const ref = (process.env.SUPABASE_PRODUCTION_PROJECT_REF ?? "").trim().toLowerCase();
  if (!/^[a-z]{20}$/.test(ref) || ref === STAGING_PROJECT_REF) throw new Error("refusing: production project ref missing, malformed or staging");
  supabaseUrl = `https://${ref}.supabase.co`;
  secretKey = (process.env.SUPABASE_PRODUCTION_SECRET_KEY ?? "").trim();
}
if (secretKey.length < 20) throw new Error("missing service key");
const expectBuild = (process.env.EXPECT_BUILD ?? process.env.EXPECT_COMMIT ?? "").trim();
// On staging the catalog entry may still be a Draft served by the preview flag; then the public listing checks are skipped.
const expectListed = (process.env.QA_EXPECT_LISTED ?? (STAGING ? "auto" : "yes")).trim();
const OUT = resolve((process.env.QA_OUT ?? "").trim() || (STAGING ? "qa-artifacts/math-race-champions/staging-qa" : "qa-artifacts/math-race-champions/production-qa"));
mkdirSync(OUT, { recursive: true });
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const extraHeaders = protection ? protection.headersFor(`${origin}/`) : {};

const results = [];
const failures = [];
const facts = {};
const redact = (text) => {
  let value = String(text);
  for (const secret of [secretKey, process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "", process.env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY ?? ""]) if (secret) value = value.split(secret).join("[redacted]");
  return value;
};
const ok = (condition, message) => {
  results.push(Boolean(condition));
  if (!condition) failures.push(redact(message));
  console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`);
  return Boolean(condition);
};
const info = (message) => console.log(`info ${redact(message)}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const hashToken = (kind, token) => sha(`math-race-champions\n${kind}\n${token}`);
const newToken = () => randomBytes(32).toString("base64url");
const rpc = async (fn, args) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
const get = (path, init = {}) => fetch(`${origin}${path}`, { redirect: "manual", ...init, headers: { ...extraHeaders, ...(init.headers ?? {}) } });

const PLAY = "/games/math-race-champions/play";
const BASE = "/internal-games/math-race-champions/";
const SENTENCE = /^Convert \d+(\.\d+)?%? to a (percent|decimal)\.$/;
const createdRooms = [];
const browsers = [];
const pageProblems = [];

async function newContext(type, options) {
  const browser = await type.launch();
  browsers.push(browser);
  const context = await browser.newContext({ baseURL: origin, ...options });
  if (protection) await protection.install(context);
  return context;
}
function watch(page, label) {
  page.on("pageerror", (error) => pageProblems.push(`${label} page error: ${error.message}`));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(origin)) return;
    if (response.status() >= 500) pageProblems.push(`${label} ${response.status()} ${new URL(url).pathname}`);
    else if (response.status() >= 400 && /\/internal-games\/|\/media\/|\/_next\/static\//.test(url)) pageProblems.push(`${label} ${response.status()} ${new URL(url).pathname}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    // A navigation cancels requests in flight (prefetches, the music stream): that is not a failure of the site.
    if (url.startsWith(origin) && /\/internal-games\/math-race-champions\//.test(url) && !/ERR_ABORTED|cancel/i.test(request.failure()?.errorText ?? "")) pageProblems.push(`${label} failed ${new URL(url).pathname}: ${request.failure()?.errorText}`);
  });
}
const audioState = (page) => page.evaluate(() => window.__MATH_RACE__.audio());
const raceView = (page) => page.evaluate(() => window.__MATH_RACE__.race?.view() ?? null);
const waitScreen = (page, name, timeout = 60_000) => page.waitForFunction((target) => document.body.dataset.screen === target, name, { timeout, polling: 150 });
const shown = (page) => page.evaluate(() => ({ text: document.querySelector(".race-question")?.textContent ?? "", form: document.querySelector(".race-question")?.dataset.form ?? "", choices: [...document.querySelectorAll(".race-choice-label")].map((node) => node.textContent ?? "") }));
async function waitGo(page, timeout = 120_000) {
  await page.waitForFunction(() => document.querySelector("main.race")?.getAttribute("data-phase") === "racing" && !document.querySelector(".race-choice")?.disabled, null, { timeout, polling: 100 });
}
async function answerOnScreen(page, correctly) {
  const question = await shown(page);
  const right = solveQuestion(question.text, question.choices);
  await page.locator(`.race-choice[data-choice="${correctly ? right : right === 0 ? 1 : 0}"]`).click({ timeout: 25_000 });
  await page.waitForFunction((previous) => {
    const button = document.querySelector(".race-choice");
    return document.querySelector("main.race")?.getAttribute("data-phase") === "finished" || (button && !button.disabled && document.querySelector(".race-question")?.textContent !== previous);
  }, question.text, { timeout: 20_000, polling: 50 }).catch(() => {});
  return question;
}

let exitCode = 1;
try {
  // ------------------------------------------------------------------ site
  const health = await get("/api/health");
  const healthBody = await health.json().catch(() => ({}));
  facts.health = { status: health.status, ...healthBody };
  ok(health.status === 200 && healthBody.status === "ready", `/api/health 200 ready (${JSON.stringify(healthBody).slice(0, 160)})`);
  const build = String(healthBody.build ?? healthBody.commit ?? "");
  if (expectBuild) ok(build.startsWith(expectBuild), `build is ${build.slice(0, 12)} (expected ${expectBuild})`);

  const catalogRow = await admin.from("game_catalog_entries").select("status,title,description,thumbnail_reference").eq("stable_key", "math-race-champions").maybeSingle();
  facts.catalog = catalogRow.data;
  const listed = expectListed === "yes" || (expectListed === "auto" && catalogRow.data?.status === "published");
  ok(catalogRow.data && (listed ? catalogRow.data.status === "published" : ["draft", "published"].includes(catalogRow.data.status)), `catalog entry is ${catalogRow.data?.status}${listed ? "" : " (not listed: public listing checks skipped)"}`);

  for (const [path, want] of [["/", 200], ["/math-games", 200], ["/join", 200], ["/help", 200]]) {
    const response = await get(path);
    ok(response.status === want, `${path} answers ${response.status}`);
  }
  const anonymous = await get(PLAY);
  const location = anonymous.headers.get("location") ?? "";
  ok([302, 303, 307, 308].includes(anonymous.status) && /^\/(access|sign-in)\?/.test(location.replace(origin, "")) && decodeURIComponent(location).includes(`next=${PLAY}`) && !/pricing|subscription|sign-up|trial/i.test(location), `signed out, ${PLAY} sends to sign in and back (${anonymous.status} ${location.replace(origin, "").slice(0, 80)}), not to pricing or a trial`);
  const anonymousApi = await get("/api/games/math-race-champions/account", { method: "POST", headers: { "content-type": "application/json", "x-mathnexa-game": "math-race-champions", "sec-fetch-site": "same-origin", origin }, body: JSON.stringify({ action: "bootstrap" }) });
  ok([401, 403].includes(anonymousApi.status), `the account API refuses an anonymous caller (${anonymousApi.status})`);

  // ---------------------------------------------------------------- assets
  const playDocument = STAGING ? null : null;
  void playDocument;
  const files = [
    "src/app.js", "src/join.js", "src/shell.js", "src/audio.js", "src/sound/race-sound.js", "src/sound/engine-model.js", "src/engine/questions.js", "src/engine/race.js",
    "src/race/race-screen.js", "src/race/minimap.js", "src/scene3d/world.js", "src/scene3d/cars.js", "src/scene3d/showroom.js", "src/scene3d/quality.js", "src/classroom/classroom.js",
    "src/classroom/track-view.js", "src/computer/garage.js", "src/computer/stages.js", "src/online/lobby.js", "src/online/online-driver.js", "styles.css"
  ];
  let served = 0;
  const bodies = {};
  for (const file of files) {
    const response = await get(`${BASE}${file}`);
    const type = response.headers.get("content-type") ?? "";
    const text = await response.text();
    bodies[file] = text;
    if (response.status === 200 && (file.endsWith(".css") ? /css/.test(type) : /javascript/.test(type)) && text.length > 200) served += 1;
    else ok(false, `${file} is not served (${response.status} ${type})`);
  }
  ok(served === files.length, `${served}/${files.length} game runtime files served (app, 3D world and cars, garage, synthesiser, engine model, classroom, online)`);
  const three = await get("/internal-games/math-tug-of-war/src/vendor/three.js");
  ok(three.status === 200 && Number(three.headers.get("content-length") ?? (await three.text()).length) > 100_000, `the shared 3D library is served (${three.status})`);
  const music = await get("/media/audio/cosmic-candy-catchers.mp3", { headers: { range: "bytes=0-1023" } });
  ok([200, 206].includes(music.status) && /audio\/mpeg/.test(music.headers.get("content-type") ?? ""), `the MathNexa music track is served (${music.status} ${music.headers.get("content-type")})`);
  for (const image of ["/media/games/math-race-champions.webp", "/media/games/math-race-champions.avif"]) {
    const response = await get(image);
    ok(response.status === 200 && /image\//.test(response.headers.get("content-type") ?? ""), `${image} is served (${response.status})`);
  }
  const engine = bodies["src/engine/questions.js"] ?? "";
  ok(engine.includes("to a decimal.") && engine.includes("to a percent.") && engine.includes("parseConversion") && !/`\$\{shownPercent\} = \?`/.test(engine), "the served question engine asks conversions in words (\"Convert … to a percent.\" / \"Convert … to a decimal.\")");
  const synth = `${bodies["src/sound/race-sound.js"] ?? ""}${bodies["src/sound/engine-model.js"] ?? ""}`;
  ok(synth.includes("createOscillator") && synth.includes("createPeriodicWave") && !/fetch\(|decodeAudioData|\.mp3|\.ogg|\.wav|https?:\/\//.test(synth), "the served racing sound is synthesised: oscillators and noise, no recording, no outside URL");
  const audioSource = bodies["src/audio.js"] ?? "";
  ok(audioSource.includes("/media/audio/cosmic-candy-catchers.mp3") && audioSource.includes("Eric Matyas") && audioSource.includes("CC BY 3.0") && (audioSource.match(/\.mp3/g) ?? []).length === 1, "the served audio names the one approved track with its credit and licence");

  // ------------------------------------------------- homepage and catalog
  if (listed) {
    const desktop = await newContext(chromium, { viewport: { width: 1366, height: 768 } });
    const page = await desktop.newPage();
    watch(page, "homepage");
    const sizes = [[390, 844], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const section = page.locator(".home-featured-games");
      await section.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector('.home-featured-games article[data-game="math-race-champions"] img');
        return image && image.complete && image.naturalWidth > 0;
      }, null, { timeout: 30_000 }).catch(() => {});
      const seen = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".home-featured-games article[data-game]")];
        const card = cards.find((entry) => entry.dataset.game === "math-race-champions");
        const box = (node) => node.getBoundingClientRect();
        const sameRow = card ? cards.filter((entry) => Math.abs(box(entry).top - box(card).top) < 4) : [];
        const link = card?.querySelector("a");
        const image = card?.querySelector("img");
        return {
          games: cards.map((entry) => entry.dataset.game),
          present: Boolean(card),
          title: card?.querySelector("h3")?.textContent ?? null,
          badge: card?.querySelector(".game-free-badge")?.textContent ?? null,
          blurb: card?.querySelector(".home-game-blurb")?.textContent ?? null,
          category: card?.querySelector(".home-game-meta")?.textContent ?? null,
          linkText: link?.textContent ?? null,
          linkName: link?.getAttribute("aria-label") ?? link?.textContent ?? null,
          href: link?.getAttribute("href") ?? null,
          links: card ? card.querySelectorAll("a").length : 0,
          imageLoaded: Boolean(image && image.complete && image.naturalWidth > 0),
          imageSource: decodeURIComponent(image?.currentSrc ?? image?.getAttribute("src") ?? ""),
          width: card ? Math.round(box(card).width) : 0,
          height: card ? Math.round(box(card).height) : 0,
          rowWidths: sameRow.map((entry) => Math.round(box(entry).width)),
          rowHeights: sameRow.map((entry) => Math.round(box(entry).height)),
          allWidths: cards.map((entry) => Math.round(box(entry).width)),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          sectionLinks: [...document.querySelectorAll(".home-featured-games a")].map((entry) => entry.getAttribute("href"))
        };
      });
      facts[`homepage-${width}x${height}`] = seen;
      ok(seen.present && seen.title === "Math Race Champions", `${width}x${height}: the homepage Free math games section has a Math Race Champions card`);
      ok(seen.badge?.trim() === "Free" && /Play Free/i.test(seen.linkText ?? "") && seen.href === PLAY && seen.links === 1, `${width}x${height}: FREE badge, one button "${(seen.linkText ?? "").trim()}" to ${seen.href}`);
      ok(seen.imageLoaded && seen.imageSource.includes("/media/games/math-race-champions."), `${width}x${height}: the card shows the real gameplay picture (${seen.imageSource.slice(0, 90)})`);
      ok(seen.overflow <= 1, `${width}x${height}: no horizontal overflow (${seen.overflow}px)`);
      ok(Math.max(...seen.allWidths) - Math.min(...seen.allWidths) <= 2 && Math.max(...seen.rowHeights) - Math.min(...seen.rowHeights) <= 2, `${width}x${height}: the card is the same size as the other free-game cards (${seen.width}x${seen.height}; widths ${seen.allWidths.join(",")}; row heights ${seen.rowHeights.join(",")})`);
      ok(seen.games.every((key) => ["polygon-showdown", "math-bingo-live", "math-tug-of-war", "math-race-champions"].includes(key)) && !seen.sectionLinks.some((href) => /pricing|subscription|sign-up/.test(href ?? "")), `${width}x${height}: only free games on the homepage (${seen.games.join(", ")}); no pricing or trial link in the section`);
      if (width === 1366 || width === 390) await section.screenshot({ path: `${OUT}/homepage-free-games-${width}x${height}.png` });
    }
    // The card's button, clicked for real while signed out: sign in for a free account, then the game. Never pricing.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator('.home-featured-games article[data-game="math-race-champions"] a').click();
    await page.waitForURL((url) => url.pathname !== "/", { timeout: 30_000 });
    const landed = new URL(page.url());
    ok(["/access", "/sign-in"].includes(landed.pathname) && (landed.searchParams.get("next") ?? "").startsWith(PLAY) && !/pricing|subscription|trial/i.test(landed.pathname), `signed out, the card's button leads to ${landed.pathname}?next=${landed.searchParams.get("next")} (sign in, then the game)`);
    // The page's own content (the site header carries its usual links on every page).
    const gate = (await page.locator("main").first().innerText()).slice(0, 4000);
    const gateText = gate.replace(/\s+/g, " ");
    ok(/Continue to Math Race Champions/i.test(gateText) && /No subscription is needed/i.test(gateText) && /does not start a subscription or a trial/i.test(gateText) && !/start (your )?free trial|choose a plan|\$\d/i.test(gateText), `the sign-in page: "${gateText.slice(0, 150)}…" (a free account only; says no subscription and no trial)`);

    await page.goto("/math-games", { waitUntil: "domcontentloaded" });
    const catalog = await page.evaluate((play) => {
      const text = document.body.innerText;
      const link = document.querySelector(`a[href="${play}"]`);
      const card = link?.closest("article, li, section, div");
      return {
        named: text.includes("Math Race Champions"),
        link: Boolean(link),
        linkText: link?.textContent?.trim() ?? null,
        cardText: (card?.innerText ?? "").slice(0, 400),
        others: ["Math Tug of War", "Math Bingo Live", "Polygon Showdown", "Math Vocabulary Hunt", "Number Logic", "Number Cross", "CrossCalc"].filter((title) => text.includes(title)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, PLAY);
    facts.mathGames = catalog;
    ok(catalog.named && catalog.link, `/math-games lists Math Race Champions with a link to ${PLAY} ("${catalog.linkText}")`);
    ok(/free/i.test(catalog.cardText), "/math-games marks Math Race Champions as free");
    const published = await admin.from("game_catalog_entries").select("title").eq("status", "published").neq("stable_key", "math-race-champions");
    const expected = (published.data ?? []).map((row) => row.title);
    const text = await page.locator("body").innerText();
    const missing = expected.filter((title) => !text.includes(title));
    ok(expected.length > 0 && missing.length === 0 && (STAGING || expected.length === 7), `/math-games still lists every other published game (${expected.length - missing.length}/${expected.length}${missing.length ? `; missing ${missing.join(", ")}` : ""})`);
    await page.screenshot({ path: `${OUT}/math-games-1366x768.png` });
    await desktop.close();
  } else {
    info("the catalog entry is not published here: homepage card and /math-games listing checks skipped");
  }

  // ------------------------------------------------------------ Online Race
  const owner = hashToken("host", `qa-owner-${Date.now()}-${randomBytes(6).toString("hex")}`);
  const hostToken = newToken();
  const creatorToken = newToken();
  let code = "";
  let created = null;
  for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
    code = String(100000 + Math.floor(Math.random() * 900000));
    const reply = await rpc("race_create_room", {
      p_code: code, p_owner_hash: owner, p_host_token_hash: hashToken("host", hostToken), p_player_token_hash: hashToken("player", creatorToken),
      p_user: null, p_name: "QA Creator", p_emoji: null, p_colour: "gold",
      p_settings: { categories: ["percent-to-decimal", "decimal-to-percent"], difficulty: "easy" },
      p_seed: randomBytes(16).toString("hex"), p_state: newRacerState()
    });
    if (reply.result === "created") created = reply;
  }
  if (!created) throw new Error("could not create a synthetic room");
  createdRooms.push(created.id);
  ok(/^[1-9]\d{5}$/.test(code), "a room with a six-digit code (synthetic, made through the room's own service function)");
  ok((await rpc("live_room_game_for_code", { p_code: code })) === "math_race_champions", "the shared code router sends this code to Math Race Champions");
  ok((await rpc("live_room_game_for_code", { p_code: "100001" })) === null, "a code nobody has belongs to no game");

  // The creator races like anyone else, over the public API.
  const samples = [];
  const onSample = ({ kind, ms, status }) => samples.push({ kind, ms, status });
  const creator = new HttpRacer(origin, { name: "QA Creator", colour: "gold", thinkMs: 450, accuracy: 1, extraHeaders, onSample });
  creator.token = creatorToken;
  ok((await creator.poll()).status === 200 && creator.room?.me?.isCreator !== false, "the creator has a seat in their own room");

  // The join link (what the QR code holds) opens this game's join screen.
  const joinDocument = await get(`/join?code=${code}`);
  const joinHtml = await joinDocument.text();
  ok(joinDocument.status === 200 && /Join Math Race Champions/.test(joinHtml) && joinHtml.includes(`${BASE}src/join.js`), "/join?code=… (the QR link) serves the Math Race Champions join screen");
  const bareJoin = await (await get("/join")).text();
  ok(/Bingo/i.test(bareJoin), "/join with no code is still the shared join screen");

  // A phone by the QR link (Chromium), a phone typing the code at /join (WebKit).
  const android = await newContext(chromium, { ...devices["Pixel 7"] });
  const ava = await android.newPage();
  watch(ava, "qr-phone");
  await ava.goto(`/join?code=${code}`);
  await waitScreen(ava, "join");
  ok((await ava.locator("#code").inputValue()) === code, "QR link: the code is already filled in");
  const before = await audioState(ava);
  ok(before.playAttempts === 0 && before.unlocked === false, "nothing is played before the first touch");
  await ava.locator("#name").fill("QA Ava");
  await ava.locator('.pick-colour[data-colour="pink"]').click();
  await ava.locator("#join-game").click();
  await waitScreen(ava, "online-lobby");
  ok((await android.cookies()).filter((cookie) => cookie.name.startsWith("sb-")).length === 0, "QR guest joined with a name only: no account, no session cookie");
  await ava.waitForFunction(() => window.__MATH_RACE__.audio().paused === false, null, { timeout: 20_000 }).catch(() => {});
  const lobbyAudio = await audioState(ava);
  ok(lobbyAudio.paused === false && lobbyAudio.source === "/media/audio/cosmic-candy-catchers.mp3" && lobbyAudio.loop === true && lobbyAudio.playAttempts === 1, `music started by itself on the first touch (no music button pressed): playing=${!lobbyAudio.paused}, attempts=${lobbyAudio.playAttempts}, route=${lobbyAudio.musicRoute}`);
  ok(Math.abs(lobbyAudio.volume - 0.2) < 0.001 && lobbyAudio.duck === 1 && lobbyAudio.error === null, `music at its menu level (${lobbyAudio.volume}), no error`);

  const iphone = await newContext(webkit, { ...devices["iPhone 13"] });
  const ben = await iphone.newPage();
  watch(ben, "typed-phone");
  await ben.goto("/join");
  await ben.locator("#code").fill(code);
  await ben.locator("#code").press("Enter");
  await ben.locator("#name").fill("QA Ben");
  await ben.locator("#name").press("Enter");
  await ben.waitForURL((url) => url.pathname === "/join" && url.searchParams.get("code") === code, { timeout: 40_000 });
  await waitScreen(ben, "online-lobby", 60_000);
  ok(true, "typed code at /join (the shared screen): handed over to the Math Race Champions lobby");

  const cleo = new HttpRacer(origin, { name: "QA Cleo", colour: "green", thinkMs: 650, accuracy: 0.9, extraHeaders, onSample });
  ok((await cleo.join(code)).status === 200, "a fourth racer joined over plain HTTP");
  await creator.poll();
  ok(creator.room.standings.length === 4, `four racers in the room (${creator.room.standings.map((row) => row.name).join(", ")})`);
  await ava.screenshot({ path: `${OUT}/online-lobby-phone.png` });

  // Start: one instant on the server's clock for everyone.
  const start = await rpc("race_host_command", { p_owner_hash: owner, p_token_hash: hashToken("host", hostToken), p_command: "start", p_args: { countdownMs: 8000 } });
  ok(start.phase === "COUNTDOWN", "the creator's Start begins the countdown");
  await creator.poll();
  ok((await creator.answer(true))?.body?.result === "not-started", "an answer sent before the lights go out is refused by the server");
  await Promise.all([waitScreen(ava, "race", 60_000), waitScreen(ben, "race", 60_000)]);
  const late = new HttpRacer(origin, { name: "QA Late", extraHeaders });
  ok([409, 423].includes((await late.join(code)).status), "joining after the start is closed");
  await Promise.all([waitGo(ava), waitGo(ben)]);
  const cars = await Promise.all([ava, ben].map((page) => page.evaluate(() => { const driver = window.__MATH_RACE__.race.driver; return { name: driver.car.name, topSpeed: driver.car.topSpeed, boost: driver.car.boost, lengthKm: driver.lengthKm, min: driver.minCorrect, starts: driver.startsAtMs() }; })));
  ok(cars.every((car) => car.name === ONLINE_CAR.name && car.topSpeed === ONLINE_CAR.topSpeed && car.boost === ONLINE_CAR.boost && car.min === MIN_CORRECT), `everyone drives the same ${cars[0].name} (${cars[0].topSpeed} km/h, +${cars[0].boost}), ${cars[0].min} correct answers needed`);
  ok(cars[0].starts === cars[1].starts && cars[0].starts === creator.room.startsAtMs, "one start time for every screen and racer");

  const racing = [creator.race(), cleo.race()];

  // Questions on the two phones: conversions asked in words, and judged by the server.
  const wordings = new Set();
  for (const [label, page] of [["QR phone (Chromium)", ava], ["typed-code phone (WebKit)", ben]]) {
    let sentences = 0;
    let fits = true;
    for (let round = 0; round < 6; round += 1) {
      const question = await shown(page);
      if (SENTENCE.test(question.text) && question.form === "sentence" && question.choices.length === 2 && parseConversion(question.text)) sentences += 1;
      wordings.add(question.text.replace(/\d+(\.\d+)?/, "N"));
      const layout = await page.evaluate(() => {
        const text = document.querySelector(".race-question").getBoundingClientRect();
        const box = document.querySelector(".race-ask").getBoundingClientRect();
        return text.left >= box.left - 1 && text.right <= box.right + 1 && text.top >= box.top - 1 && text.bottom <= box.bottom + 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
      });
      fits = fits && layout;
      const view = await raceView(page);
      const correctly = round !== 3;
      await answerOnScreen(page, correctly);
      const after = await raceView(page);
      if (!(after.correct === view.correct + (correctly ? 1 : 0) && after.wrong === view.wrong + (correctly ? 0 : 1))) fits = false;
      if (round === 0) info(`${label}: "${question.text}" ${question.choices.join(" | ")}`);
    }
    ok(sentences === 6, `${label}: six questions, all asked in words with two answers`);
    ok(fits, `${label}: the sentence fits its box, and the server counted five correct and one wrong exactly`);
  }
  ok(wordings.has("Convert N to a percent.") && wordings.has("Convert N% to a decimal."), `both sentences were asked: ${[...wordings].join(" / ")}`);
  await ava.screenshot({ path: `${OUT}/online-race-phone-chromium.png` });
  await ben.screenshot({ path: `${OUT}/online-race-phone-webkit.png` });

  // Sound during the race.
  const raceAudio = await audioState(ava);
  facts.raceAudio = raceAudio;
  ok(raceAudio.paused === false && Math.abs(raceAudio.duck - 0.55) < 0.001 && raceAudio.playAttempts === 1, `music keeps playing, turned down under the race (${raceAudio.volume.toFixed(3)}), still the one track`);
  ok(raceAudio.race.car === "circuit-standard" && raceAudio.race.sounding === true && raceAudio.race.profile === "circuit-standard" && raceAudio.race.starts === 1 && raceAudio.contextState === "running", `the car's engine is sounding: one synthesiser, ${raceAudio.race.rpm} rpm, gear ${raceAudio.race.gear}`);
  // Engine response, recorded inside the page around a correct and a wrong answer.
  const record = async (page, correctly) => {
    await page.evaluate(() => {
      window.__qaLog = [];
      window.__qaTimer = setInterval(() => { const view = window.__MATH_RACE__.race.view(); window.__qaLog.push({ ...window.__MATH_RACE__.audio().race, correct: view.correct, wrong: view.wrong, at: performance.now() }); }, 40);
    });
    await answerOnScreen(page, correctly);
    await sleep(correctly ? 900 : 200);
    return page.evaluate(() => { clearInterval(window.__qaTimer); return window.__qaLog; });
  };
  const rise = await record(ava, true);
  const landedRight = rise.findIndex((frame) => frame.correct > rise[0].correct);
  const afterRight = rise.slice(Math.max(0, landedRight));
  ok(landedRight >= 0 && Math.max(...afterRight.map((frame) => frame.throttle ?? 0)) > 0.8, `a correct answer opens the throttle (peak ${Math.max(...afterRight.map((frame) => frame.throttle ?? 0))}) and the engine climbs`);
  const fall = await record(ava, false);
  const landedWrong = fall.findIndex((frame) => frame.wrong > fall[0].wrong);
  const afterWrong = landedWrong < 0 ? [] : fall.filter((frame) => frame.at > fall[landedWrong].at + 150 && frame.at < fall[landedWrong].at + 1250);
  const speedRose = afterWrong.some((frame, index) => index > 0 && frame.speed > afterWrong[index - 1].speed + 0.01);
  ok(afterWrong.length > 1 && Math.max(...afterWrong.map((frame) => frame.throttle ?? 0)) < 0.05 && !speedRose && afterWrong[afterWrong.length - 1].speed < fall[Math.max(0, landedWrong - 1)].speed, `a wrong answer gives no acceleration sound: throttle shut (max ${afterWrong.length ? Math.max(...afterWrong.map((frame) => frame.throttle ?? 0)) : "n/a"}), engine speed only falls (${afterWrong.length} samples)`);
  const webkitAudio = await audioState(ben);
  facts.webkitAudio = webkitAudio;
  // On a protected staging preview the Windows WebKit test build fetches media outside the browser's cookie jar, so
  // Vercel's protection refuses the track there (it plays in the same build locally, and Production has no protection).
  const protectedMedia = STAGING && webkitAudio.error !== null && webkitAudio.playAttempts >= 1;
  if (protectedMedia) info(`WebKit phone on the protected preview: the track request did not carry the preview's bypass cookie (${webkitAudio.error}); music on WebKit is checked locally and on Production`);
  else ok(webkitAudio.paused === false && webkitAudio.error === null && webkitAudio.race.car === "circuit-standard", `WebKit phone: music playing (paused=${webkitAudio.paused}, attempts=${webkitAudio.playAttempts}, unlocked=${webkitAudio.unlocked}, error=${webkitAudio.error}, route=${webkitAudio.musicRoute}), race sound ${webkitAudio.race.sounding ? "sounding" : "not available in this test build (no Web Audio); music only"}`);

  // Progress, minimap and leaderboard agree on the phone.
  await sleep(1500);
  const hud = await ava.evaluate(() => ({
    progress: Number(document.querySelector("main.race").dataset.progress),
    text: document.querySelector(".hud-chip-race .hud-chip-value").textContent,
    correct: document.querySelector(".hud-chip-correct .hud-chip-value").textContent,
    rivals: document.querySelectorAll(".minimap-rival").length,
    board: [...document.querySelectorAll(".hud-board li")].map((row) => row.textContent),
    me: document.querySelectorAll(".hud-board li.is-me").length,
    position: document.querySelector(".hud-position").textContent,
    graphics: document.querySelector("main.race").dataset.graphics,
    speed: document.querySelector(".speedo-number").textContent
  }));
  facts.hud = hud;
  ok(hud.progress > 0 && hud.text === `${Math.floor(hud.progress * 100)}%` && /\/30 minimum|✓/.test(hud.correct), `progress ${hud.text}, correct "${hud.correct}", speed ${hud.speed} km/h, picture "${hud.graphics}"`);
  ok(hud.rivals === 3 && hud.board.length >= 3 && hud.me === 1 && /of 4$/.test(hud.position), `minimap shows the 3 other racers; leaderboard has ${hud.board.length} rows with one marked as me; position "${hud.position}"`);
  ok(["low", "medium", "high"].includes(hud.graphics), `a real 3D scene is drawing on the phone (${hud.graphics})`);

  // Reconnect: a refresh comes back to the same seat with the same progress.
  const mine = async (page) => page.evaluate(() => { const state = window.__MATH_RACE__.race.driver.state(); return { correct: state.correct, x: state.x }; });
  const beforeReload = await mine(ava);
  await ava.reload();
  await waitScreen(ava, "race", 60_000);
  await ava.waitForFunction(() => Boolean(window.__MATH_RACE__?.race), null, { timeout: 60_000 });
  const afterReload = await mine(ava);
  ok(afterReload.correct === beforeReload.correct && afterReload.x >= beforeReload.x, `reconnect: after a refresh the phone is back in its seat with ${afterReload.correct} correct and no lost distance`);
  const seats = await admin.from("race_participants").select("id", { count: "exact", head: true }).eq("room_id", created.id).eq("status", "active");
  ok(seats.count === 4, `still exactly four seats in the room (${seats.count}): the refresh did not make a second one`);

  // The two HTTP racers run to the flag; the server decides the finish.
  info("waiting for the two HTTP racers to finish the 8 km race…");
  const deadline = Date.now() + 12 * 60 * 1000;
  while (!(creator.finished && cleo.finished) && Date.now() < deadline) await sleep(2000);
  ok(creator.finished && cleo.finished, `both HTTP racers crossed the line (creator ${creator.me?.finishMs} ms, Cleo ${cleo.me?.finishMs} ms)`);
  await creator.poll();
  const standings = creator.room.standings;
  const finishers = standings.filter((row) => row.f !== null);
  facts.standings = standings.map((row) => ({ name: row.name, rank: row.rank, finishMs: row.f, correct: row.correct }));
  ok(finishers.length >= 2 && finishers.every((row) => row.correct >= MIN_CORRECT), `every finisher has ${MIN_CORRECT} correct answers or more (${finishers.map((row) => `${row.name} ${row.correct}`).join(", ")})`);
  let ordered = true;
  for (let index = 1; index < finishers.length; index += 1) if (finishers[index].f < finishers[index - 1].f || finishers[index].rank < finishers[index - 1].rank) ordered = false;
  ok(ordered && finishers[0].rank === 1, `finishing order is by the server's finish times (${finishers.map((row) => `${row.rank}. ${row.name}`).join(", ")})`);
  const creatorRow = standings.find((row) => row.name === "QA Creator");
  ok(creatorRow && creatorRow.f !== null, `the creator raced and finished (${creatorRow?.rank}${creatorRow ? "." : ""})`);
  await ava.waitForFunction(() => [...document.querySelectorAll(".hud-board li .score")].some((node) => node.textContent.includes("⚑")), null, { timeout: 30_000 }).catch(() => {});
  ok(await ava.evaluate(() => [...document.querySelectorAll(".hud-board li .score")].some((node) => node.textContent.includes("⚑"))), "the phone's leaderboard shows who has finished");

  // The creator ends the race; every screen gets the final result.
  await rpc("race_host_command", { p_owner_hash: owner, p_token_hash: hashToken("host", hostToken), p_command: "end", p_args: {} }).catch(() => null);
  await Promise.all(racing.map((run) => Promise.race([run, sleep(20_000)])));
  await ava.waitForFunction(() => document.querySelector("main.race")?.getAttribute("data-phase") === "finished", null, { timeout: 60_000 }).catch(() => {});
  const result = await ava.evaluate(() => ({ phase: document.querySelector("main.race")?.getAttribute("data-phase"), title: document.querySelector("#result-title")?.textContent ?? null, rows: document.querySelectorAll(".result-ranking li").length }));
  ok(result.phase === "finished" && result.rows === 4, `the phone shows the final result ("${result.title}", ${result.rows} racers ranked)`);
  await ava.screenshot({ path: `${OUT}/online-result-phone.png` });
  const ended = await audioState(ava);
  ok(ended.race.sounding === false || ended.race.ending === true || ended.race.car === null, "the engine is released when the race is over");

  const latency = (kind) => {
    const values = samples.filter((sample) => sample.kind === kind).map((sample) => sample.ms).sort((a, b) => a - b);
    return values.length ? { n: values.length, median: Math.round(values[Math.floor(values.length / 2)]), p95: Math.round(values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]) } : null;
  };
  facts.latency = { poll: latency("state"), answer: latency("answer"), join: latency("join") };
  const serverErrors = samples.filter((sample) => sample.status >= 500).length;
  ok(serverErrors === 0, `no 5xx from the game API in ${samples.length} requests (poll p95 ${facts.latency.poll?.p95} ms, answer p95 ${facts.latency.answer?.p95} ms)`);
  ok(pageProblems.length === 0, `no page errors, 5xx or missing game files in the browsers${pageProblems.length ? `: ${pageProblems.slice(0, 6).join("; ")}` : ""}`);
  exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  ok(false, `QA stopped: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
} finally {
  for (const browser of browsers) await browser.close().catch(() => {});
  if (createdRooms.length) await admin.from("race_rooms").delete().in("id", createdRooms);
  const left = createdRooms.length ? await admin.from("race_rooms").select("id", { count: "exact", head: true }).in("id", createdRooms) : { count: 0 };
  ok(left.count === 0, `synthetic rooms left behind: ${left.count}`);
  const passed = results.filter(Boolean).length;
  writeFileSync(`${OUT}/qa-result.json`, `${JSON.stringify({ target: STAGING ? "staging preview" : origin, at: new Date().toISOString(), passed, total: results.length, failures, facts }, null, 2)}\n`);
  console.log(`\n${passed}/${results.length} checks passed${failures.length ? `; FAILED: ${failures.length}` : ""}`);
}
process.exit(failures.length === 0 && exitCode === 0 ? 0 : 1);
