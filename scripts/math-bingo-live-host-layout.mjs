/**
 * Math Bingo Live — host board layout check on the running local app.
 *
 * Builds real rooms through the real API: 1, 5, 10, 30 and 50 players, no
 * winners / 1 winner / 3 winners, a long arithmetic and a long fraction
 * history, the question, reveal and paused states, the Bingo celebration,
 * and the five winning-ways setups. At 1280x720, 1366x768, 1440x900 and
 * 1920x1080 it checks that the page itself never scrolls, that the header,
 * winning ways, standings, Bingo winners, question, timer, called list and
 * controls are all on screen in their places, and that the winning ways on
 * the host AND on a student screen are exactly the room's own settings.
 * Screenshots and report.json go to qa-artifacts/math-bingo-live/host-layout/.
 *
 *   node scripts/run-math-bingo-live.mjs layout          (starts the app)
 *   MATH_BINGO_LIVE_URL=... SUPABASE_TEST_URL=... SUPABASE_TEST_SECRET_KEY=... node scripts/math-bingo-live-host-layout.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const engine = "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/";
const { enabledLines, popcount } = await import(`${engine}board.js`);

const ORIGIN = process.env.MATH_BINGO_LIVE_URL ?? "http://127.0.0.1:3100";
const PLAY = `${ORIGIN}/api/games/math-bingo-live/play`;
const HEADERS = { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live", "Sec-Fetch-Site": "same-origin", Origin: ORIGIN };
const EMAIL = "bingo-layout@example.test";
const PASSWORD = "BingoLayoutTeacher42!";
const OUT = resolve("qa-artifacts/math-bingo-live/host-layout");
mkdirSync(OUT, { recursive: true });

if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.SUPABASE_TEST_URL ?? "")) throw new Error("The layout check is local-only.");
const admin = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const VIEWPORTS = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 }
];
const NAMES = ["Ava", "Zion", "Omar", "Desmond", "Mia", "Liam", "Noah", "Emma", "Ethan", "Sofia", "Lucas", "Amara", "Kai", "Leah", "Mateo",
  "Nia", "Owen", "Priya", "Ravi", "Sara", "Theo", "Uma", "Victor", "Wren", "Xavier", "Yara", "Zoe", "Aiden", "Bella", "Caleb", "Diego",
  "Elena", "Felix", "Grace", "Hana", "Isaac", "Jada", "Kofi", "Lina", "Malik", "Nora", "Oscar", "Paige", "Quinn", "Rosa", "Sami",
  "Tara", "Maximiliana Gonzalez", "Will", "Ximena"];
const ALL = { rows: true, columns: true, diagonals: true };
const settingsFor = (overrides = {}) => ({
  mode: "addition", level: "facts-20", questionSeconds: 0, revealSeconds: 0, patterns: ALL, winners: 3,
  freeSpace: true, music: "off", celebration: "host", equivalentFractions: false, ...overrides
});

const failures = [];
const checks = [];
const fail = (label, message) => failures.push(`${label}: ${message}`);
const sleep = ms => new Promise(done => setTimeout(done, ms));

async function post(body, address) {
  const response = await fetch(PLAY, { method: "POST", headers: { ...HEADERS, "x-vercel-forwarded-for": address }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() };
}

async function ensureTeacher() {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = listed.data.users.find(user => user.email === EMAIL);
  if (existing) await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
  else {
    const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
    if (created.error) throw created.error;
  }
}

async function openHost(browser) {
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => fail("host page", error.message));
  await page.goto(`/sign-in?next=${encodeURIComponent("/games/math-bingo-live/host")}`);
  await page.getByLabel("Email address").fill(EMAIL);
  await page.locator('input[name="password"]').first().fill(PASSWORD);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL(url => url.pathname === "/games/math-bingo-live/host", { timeout: 120_000 });
  await page.waitForFunction(() => ["setup", "lobby", "host-game", "complete"].includes(document.body.dataset.screen), null, { timeout: 60_000 });
  const host = (action, extra = {}) => page.evaluate(async ({ action, extra }) => {
    const reply = await fetch("/api/games/math-bingo-live/host", {
      method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin",
      body: JSON.stringify({ action, hostToken: sessionStorage.getItem("mathnexa:math-bingo-live:host-token"), ...extra })
    });
    const json = await reply.json();
    if (json.hostToken) sessionStorage.setItem("mathnexa:math-bingo-live:host-token", json.hostToken);
    return json;
  }, { action, extra });
  return { context, page, host };
}

/** A room with n HTTP students, started and on question 1. */
async function openRoom(hostView, count, settings, address) {
  const { page, host } = hostView;
  if ((await page.locator("body").getAttribute("data-screen")) !== "setup") {
    await host("close");
    await page.evaluate(() => sessionStorage.clear());
  }
  const created = await host("create", { settings });
  if (created.result !== "created") throw new Error(`create: ${JSON.stringify(created)}`);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.screen === "lobby", null, { timeout: 60_000 });
  const code = created.state.code;
  const students = [];
  for (let index = 0; index < count; index += 1) {
    const joined = await post({ action: "join", code, name: NAMES[index] }, address);
    if (joined.status !== 200) throw new Error(`join ${index}: ${joined.status} ${JSON.stringify(joined.json)}`);
    students.push({ name: NAMES[index], token: joined.json.token });
  }
  const started = await host("start");
  if (started.result !== "started") throw new Error(`start: ${JSON.stringify(started)}`);
  const state = await toQuestion(host);
  await refresh(students, address);
  return { code, students, state };
}

async function refresh(students, address) {
  await Promise.all(students.map(async student => {
    const reply = await post({ action: "state", token: student.token }, address);
    if (reply.status === 200) student.state = reply.json.state;
  }));
}

/** Host "Next" until a question is live (or the game is over). */
async function toQuestion(host) {
  let state = (await host("state")).state;
  for (let guard = 0; guard < 40 && !["QUESTION_ACTIVE", "GAME_COMPLETE"].includes(state.phase); guard += 1) {
    if (["COUNTDOWN", "ANSWER_REVEAL", "LEADERBOARD_UPDATE"].includes(state.phase)) state = (await host("next", { phase: state.phase, question: state.questionNumber })).state ?? (await host("state")).state;
    else {
      await sleep(700);
      state = (await host("state")).state;
    }
  }
  return state;
}

function answerOf(question) {
  if (question.kind === "fraction") {
    const [n, d] = question.text.split("/").map(Number);
    return { n, d };
  }
  const [a, op, b] = question.text.split(" ");
  const x = Number(a);
  const y = Number(b);
  return { n: { "+": x + y, "−": x - y, "×": x * y, "÷": x / y }[op], d: 1 };
}

/** A student taps the best matching cell; with hold, never the one that completes a line. */
async function mark(student, room, address, { hold = false } = {}) {
  const state = student.state;
  if (!state?.me?.board || state.me.hasWon || state.phase !== "QUESTION_ACTIVE") return null;
  const answer = answerOf(state.question);
  const lines = enabledLines(state.settings.patterns);
  let best = null;
  state.me.board.forEach((cell, index) => {
    if (cell.free || ((state.me.marks >>> index) & 1) === 1 || cell.n !== answer.n || cell.d !== answer.d) return;
    const score = Math.max(...lines.map(line => popcount((state.me.marks | (1 << index)) & line.mask)));
    if (hold && score >= 5) return;
    if (!best || score > best.score) best = { index, score };
  });
  if (!best) return null;
  const reply = await post({ action: "mark", token: student.token, game: state.gameNumber, question: state.questionNumber, cell: best.index }, address);
  if (reply.json.state) student.state = reply.json.state;
  return reply.json;
}

/** Wait until the host screen itself shows the wanted state (a function, not a string: the page CSP forbids eval). */
async function uiSettled(page, want, label) {
  await page.waitForFunction(want => {
    const s = window.__MATH_BINGO_LIVE__.state;
    if (!s || document.body.dataset.screen !== "host-game") return false;
    if (want.phase && s.phase !== want.phase) return false;
    if (want.phases && !want.phases.includes(s.phase)) return false;
    if (want.players !== undefined && s.players.length !== want.players) return false;
    if (want.minWinners !== undefined && s.winnerCount < want.minWinners) return false;
    if (want.question !== undefined && s.questionNumber !== want.question) return false;
    return true;
  }, want, { timeout: 30_000 }).catch(() => fail(label, "host screen did not reach the expected state"));
  await page.waitForTimeout(450);
}

/** Reveal the current question if it is still live, then on to the next one. */
async function advance(host) {
  const state = (await host("state")).state;
  if (state.phase === "QUESTION_ACTIVE") await host("next", { phase: state.phase, question: state.questionNumber });
  return toQuestion(host);
}

/** Every board check, at the current viewport. */
async function measure(page, viewport, label, { players }) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const parts = {
      header: ".host-head", code: ".head-code, .head-locked", ways: ".ways-strip .rules", standings: ".panel-standings",
      winners: ".panel-winners", question: ".panel-question", timer: ".host-timer", called: ".panel-called", controls: ".controls"
    };
    const boxes = Object.fromEntries(Object.entries(parts).map(([key, selector]) => [key, rect(document.querySelector(selector))]));
    const headings = [...document.querySelectorAll(".panel-title, .ways-strip .rules-title")].map(element => ({ text: element.textContent, box: rect(element) }));
    const scroller = document.querySelector(".panel-standings .panel-scroll").getBoundingClientRect();
    const rows = [...document.querySelectorAll(".standing")];
    const visibleRows = rows.filter(row => { const r = row.getBoundingClientRect(); return r.top >= scroller.top - 1 && r.bottom <= scroller.bottom + 1; }).length;
    const face = document.querySelector(".stage .question-text, .stage .frac, .stage .reveal-text, .stage .stage-ready");
    const buttons = [...document.querySelectorAll(".controls button")].map(button => ({ text: button.textContent.trim(), box: rect(button) }));
    const head = document.querySelector(".host-head");
    return {
      scrollHeight: Math.max(doc.scrollHeight, document.body.scrollHeight), scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
      innerHeight: window.innerHeight, innerWidth: window.innerWidth, boxes, headings, rows: rows.length, visibleRows,
      faceFont: face ? Number.parseFloat(getComputedStyle(face).fontSize) : null,
      faceBox: rect(face), faceText: face?.textContent ?? null, buttons,
      headerClipped: head.scrollWidth > head.clientWidth + 1,
      standingFont: rows[0] ? Number.parseFloat(getComputedStyle(rows[0]).fontSize) : null
    };
  });
  const W = viewport.width;
  const H = viewport.height;
  const where = `${label} @ ${viewport.name}`;
  if (result.scrollHeight > H + 1) fail(where, `page scrolls vertically (${result.scrollHeight} > ${H})`);
  if (result.scrollWidth > W + 1) fail(where, `page scrolls sideways (${result.scrollWidth} > ${W})`);
  if (result.headerClipped) fail(where, "header content is clipped");
  for (const [key, box] of Object.entries(result.boxes)) {
    if (!box || box.w < 1 || box.h < 1) fail(where, `${key} missing`);
    else if (box.x < -1 || box.y < -1 || box.right > W + 1 || box.bottom > H + 1) fail(where, `${key} off screen ${JSON.stringify(box)}`);
  }
  const b = result.boxes;
  if (b.standings && b.question && !(b.standings.right <= b.question.x + 1)) fail(where, "standings are not left of the question");
  if (b.question && b.called && !(b.question.bottom <= b.called.y + 1)) fail(where, "the question is not above the called list");
  if (b.standings && b.winners && !(b.standings.bottom <= b.winners.y + 1)) fail(where, "Bingo winners are not under the standings");
  if (b.ways && b.standings && !(b.ways.bottom <= Math.min(b.standings.y, b.question.y) + 1)) fail(where, "winning ways are not above the board");
  if (b.controls && !(b.controls.y >= Math.max(b.winners.bottom, b.called.bottom) - 1)) fail(where, "controls are not below the board");
  if (b.question && b.called && b.question.h < b.called.h) fail(where, "the question panel is smaller than the called panel");
  for (const heading of result.headings) if (!heading.box || heading.box.bottom > H + 1 || heading.box.h < 1) fail(where, `heading ${heading.text} hidden`);
  for (const button of result.buttons) if (button.box.w < 44 || button.box.h < 44) fail(where, `control ${button.text} below 44 px`);
  const wantRows = Math.min(players, 8);
  if (result.visibleRows < wantRows) fail(where, `only ${result.visibleRows} standings rows visible (want ${wantRows})`);
  if (result.faceBox && b.question && (result.faceBox.right > b.question.right + 1 || result.faceBox.bottom > b.question.bottom + 1)) fail(where, "the question text overflows its panel");
  const shot = `${label}-${viewport.name}.png`.replace(/[^a-z0-9.-]+/gi, "-");
  await page.screenshot({ path: resolve(OUT, shot) });
  checks.push({ label, viewport: viewport.name, shot, rows: result.rows, visibleRows: result.visibleRows, faceFont: result.faceFont, faceText: result.faceText, standingFont: result.standingFont, page: `${result.scrollWidth}x${result.scrollHeight}` });
  return result;
}

async function allViewports(page, label, players) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(350);
    await measure(page, viewport, label, { players });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

/** The winning ways on the host and on a student screen are exactly the room's settings. */
async function checkWays(hostView, playerPage, patterns, label) {
  const hostState = (await hostView.host("state")).state;
  const expected = hostState.settings.patterns;
  for (const key of ["rows", "columns", "diagonals"]) if (expected[key] !== patterns[key]) fail(label, `server settings ${key}=${expected[key]}, asked ${patterns[key]}`);
  const read = page => page.evaluate(selector => Object.fromEntries([...document.querySelectorAll(selector)].map(item => [item.dataset.pattern, {
    on: item.classList.contains("is-on"), mark: item.querySelector(".rule-mark").textContent, label: item.getAttribute("aria-label")
  }])), page === playerPage ? ".rules [data-pattern]" : ".ways-strip [data-pattern]");
  const words = { rows: "Row", columns: "Column", diagonals: "Diagonal" };
  for (const [screen, page] of [["host", hostView.page], ["student", playerPage]]) {
    const shown = await read(page);
    for (const key of ["rows", "columns", "diagonals"]) {
      const item = shown[key];
      if (!item) { fail(label, `${screen} does not show ${key}`); continue; }
      if (item.on !== expected[key]) fail(label, `${screen} shows ${key} ${item.on ? "on" : "off"}, room says ${expected[key]}`);
      if (item.mark !== (expected[key] ? "✓" : "○")) fail(label, `${screen} ${key} symbol ${item.mark}`);
      if (item.label !== `${words[key]} wins ${expected[key] ? "enabled" : "disabled"}`) fail(label, `${screen} ${key} label "${item.label}"`);
    }
  }
  return expected;
}

const browser = await chromium.launch();
const report = { origin: ORIGIN, viewports: VIEWPORTS.map(item => item.name), scenarios: [], ways: [] };
try {
  await ensureTeacher();
  const hostView = await openHost(browser);
  const { page, host } = hostView;

  // A-D: 1, 5, 10 and 30 players on question 1 (no winners yet).
  for (const [index, count] of [1, 5, 10, 30].entries()) {
    const address = `198.19.${index + 1}.1`;
    const room = await openRoom(hostView, count, settingsFor(), address);
    for (const [order, student] of room.students.entries()) if (order % 2 === 0) await mark(student, room, address, { hold: true });
    await uiSettled(page, { phase: "QUESTION_ACTIVE", players: count }, `${count} players`);
    await allViewports(page, `${count}-players-question`, count);
    report.scenarios.push({ scenario: `${count} players, question active, no winners`, code: room.code });
  }

  // E-I, K-N: 50 players, winners 1 then 3, reveal, pause, celebration, long history.
  {
    const address = "198.19.50.1";
    const room = await openRoom(hostView, 50, settingsFor({ winners: 5 }), address);
    let state = room.state;
    await uiSettled(page, { phase: "QUESTION_ACTIVE", players: 50 }, "50 players");
    await allViewports(page, "50-players-question-no-winners", 50);
    const racers = room.students.slice(0, 5);
    let celebrated = false;
    let shotOne = false;
    let shotRevealPause = false;
    for (let guard = 0; guard < 70 && state.phase === "QUESTION_ACTIVE"; guard += 1) {
      await refresh(room.students, address);
      const target = racers[state.winnerCount];
      const results = [];
      for (const [order, student] of room.students.entries()) {
        if (racers.includes(student)) results.push(await mark(student, room, address, { hold: student !== target || state.winnerCount >= 3 }));
        else if ((order + guard) % 3 === 0) await mark(student, room, address, { hold: true });
      }
      const fresh = (await host("state")).state;
      if (!celebrated && fresh.winnerCount === 1) {
        // N: the Bingo announcement over the board.
        celebrated = true;
        await page.waitForSelector(".board-left > .banner.tone-bingo:not([hidden])", { timeout: 8000 }).catch(() => fail("celebration", "no Bingo banner over the board"));
        // The announcement covers the left column only: winning ways, question and controls stay in view.
        const cover = await page.evaluate(() => {
          const r = selector => document.querySelector(selector).getBoundingClientRect();
          const banner = r(".board-left > .banner");
          const hits = [".ways-strip", ".panel-question", ".panel-called", ".controls", ".host-head"].filter(selector => {
            const other = r(selector);
            return banner.left < other.right && banner.right > other.left && banner.top < other.bottom && banner.bottom > other.top;
          });
          return { hits, text: document.querySelector(".board-left > .banner").textContent };
        });
        if (cover.hits.length) fail("celebration", `banner covers ${cover.hits.join(", ")}`);
        if (/null|undefined/.test(cover.text)) fail("celebration", `banner text "${cover.text}"`);
        if (!/BINGO!/.test(cover.text) || !/FIRST BINGO/.test(cover.text)) fail("celebration", `banner text "${cover.text}"`);
        await measure(page, VIEWPORTS[1], "50-players-bingo-celebration", { players: 0 });
        await page.waitForSelector(".board-left > .banner", { state: "hidden", timeout: 15_000 }).catch(() => {});
      }
      if (!shotRevealPause && fresh.questionNumber >= 3) {
        shotRevealPause = true;
        // M: paused during a live question.
        await host("pause");
        await uiSettled(page, { phase: "PAUSED" }, "paused");
        await allViewports(page, "50-players-paused", 50);
        await host("unpause");
        await uiSettled(page, { phase: "QUESTION_ACTIVE" }, "resumed");
        // L: the answer reveal in the question's place.
        const revealed = (await host("next", { phase: "QUESTION_ACTIVE", question: fresh.questionNumber })).state;
        await uiSettled(page, { phase: "ANSWER_REVEAL", question: revealed.questionNumber }, "reveal");
        await allViewports(page, "50-players-answer-reveal", 50);
      }
      if (!shotOne && fresh.winnerCount === 1 && celebrated) {
        // G: one winner on the board.
        shotOne = true;
        await uiSettled(page, { minWinners: 1, phases: ["QUESTION_ACTIVE", "ANSWER_REVEAL", "LEADERBOARD_UPDATE", "WINNER_REVEAL"] }, "one winner");
        await allViewports(page, "50-players-1-winner", 50);
      }
      if (fresh.winnerCount >= 3 && fresh.questionNumber >= 18) break;
      state = await advance(host);
    }
    state = await toQuestion(host);
    if (state.winnerCount < 3) fail("50 players", `only ${state.winnerCount} winners`);
    // H + I: three winners and a long arithmetic history.
    await uiSettled(page, { minWinners: 3, phase: "QUESTION_ACTIVE" }, "three winners");
    await allViewports(page, "50-players-3-winners-long-history", 50);
    report.scenarios.push({ scenario: "50 players: none, 1 and 3 winners, reveal, pause, celebration, long called history", code: room.code, questions: state.questionNumber, winners: state.winnerCount });
  }

  // J: Fraction Bingo with a long Called Fractions history.
  {
    const address = "198.19.60.1";
    const room = await openRoom(hostView, 10, settingsFor({ mode: "fractions", level: "to-eighths", winners: 3 }), address);
    let state = room.state;
    // Each fraction is called once (22 at "to eighths"): stop one before the end of the deck.
    const last = Math.min(25, state.deckLength - 1);
    for (let question = 1; question <= last && state.phase === "QUESTION_ACTIVE"; question += 1) {
      state = (await host("next", { phase: "QUESTION_ACTIVE", question: state.questionNumber })).state;
      if (question === last) break;
      state = await toQuestion(host);
    }
    await uiSettled(page, { phase: "ANSWER_REVEAL" }, "fraction reveal");
    await allViewports(page, "fractions-reveal-long-history", 10);
    state = await toQuestion(host);
    await uiSettled(page, { phase: "QUESTION_ACTIVE", question: state.questionNumber }, "fraction question");
    await allViewports(page, "fractions-question-long-history", 10);
    report.scenarios.push({ scenario: "Fraction Bingo, long Called Fractions history", code: room.code, questions: state.questionNumber });
  }

  // O-S: the five winning-ways setups, host and student.
  const setups = [
    ["rows-only", { rows: true, columns: false, diagonals: false }],
    ["columns-only", { rows: false, columns: true, diagonals: false }],
    ["diagonals-only", { rows: false, columns: false, diagonals: true }],
    ["rows-columns", { rows: true, columns: true, diagonals: false }],
    ["all-ways", ALL]
  ];
  for (const [index, [name, patterns]] of setups.entries()) {
    const address = `198.19.${70 + index}.1`;
    const playerContext = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 390, height: 844 } });
    const player = await playerContext.newPage();
    const { page: hostPage } = hostView;
    if ((await hostPage.locator("body").getAttribute("data-screen")) !== "setup") {
      await host("close");
      await hostPage.evaluate(() => sessionStorage.clear());
    }
    const created = await host("create", { settings: settingsFor({ patterns }) });
    await hostPage.reload();
    await hostPage.waitForFunction(() => document.body.dataset.screen === "lobby");
    await player.goto(`/join?code=${created.state.code}`);
    await player.getByLabel("YOUR NAME").fill("Ava");
    await player.getByRole("button", { name: "JOIN GAME" }).click();
    await player.getByText("You're in!").waitFor();
    await post({ action: "join", code: created.state.code, name: "Zion" }, address);
    await host("start");
    await toQuestion(host);
    await uiSettled(hostPage, { phase: "QUESTION_ACTIVE" }, name);
    await player.waitForFunction(() => window.__MATH_BINGO_LIVE__.state?.phase === "QUESTION_ACTIVE" && document.querySelector(".rules [data-pattern]"), null, { timeout: 30_000 });
    const shown = await checkWays(hostView, player, patterns, name);
    await hostPage.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
    await hostPage.waitForTimeout(350);
    await measure(hostPage, VIEWPORTS[0], `ways-${name}`, { players: 2 });
    await hostPage.setViewportSize({ width: 1366, height: 768 });
    await player.screenshot({ path: resolve(OUT, `ways-${name}-student-390x844.png`) });
    report.ways.push({ setup: name, room: shown });
    await playerContext.close();
  }

  await host("close");
  await hostView.context.close();
} finally {
  await browser.close();
}

report.checks = checks;
report.failures = failures;
writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
for (const check of checks) console.log(`${check.label.padEnd(44)} ${check.viewport.padEnd(10)} rows ${String(check.visibleRows).padStart(2)}/${String(check.rows).padEnd(2)} face ${check.faceFont ?? "-"}px  page ${check.page}`);
console.log(failures.length ? `\nFAIL (${failures.length})\n${failures.join("\n")}` : `\nPASS: ${checks.length} board checks, ${report.ways.length} winning-ways setups`);
process.exit(failures.length ? 1 : 0);
