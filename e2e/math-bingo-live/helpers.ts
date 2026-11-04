import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

export const HOST_ROUTE = "/games/math-bingo-live/host";
export const JOIN_ROUTE = "/join";
export const BASE_URL = process.env.MATH_BINGO_LIVE_URL ?? "http://127.0.0.1:3100";
export const TEACHER = { email: process.env.BINGO_TEACHER_EMAIL ?? "bingo-teacher@example.test", password: process.env.BINGO_TEACHER_PASSWORD ?? "" };

export type Cell = { free?: true; n: number; d: number; shape?: string };
export type Question = { number: number; text: string; spoken: string; kind: "arithmetic" | "fraction"; reveal: { text: string; answer: { n: number; d: number }; description: string | null } | null };
export type LiveState = {
  code: string;
  phase: string;
  gameNumber: number;
  questionNumber: number;
  question: Question | null;
  called: Question[];
  settings: { mode: string; patterns: { rows: boolean; columns: boolean; diagonals: boolean }; equivalentFractions: boolean; freeSpace: boolean; winners: number };
  winners: Array<{ name: string; placement: number; lineType: string; line: string }>;
  winnerCount: number;
  events: Array<{ seq: number; type: string; name: string; placement: number | null }>;
  leaderboard: Array<{ name: string; rank: number; won: boolean; placement: number | null; best: number; type: string | null }>;
  players?: Array<{ id: string; name: string }>;
  me?: { name: string; board: Cell[] | null; marks: number; freeUsed: boolean; markUsed: boolean; hasWon: boolean; placement: number | null; best: number; rank: number | null; attemptsLeft: number };
};

const LINE_MASKS = {
  row: [31, 992, 31744, 1015808, 32505856],
  column: [1082401, 2164802, 4329604, 8659208, 17318416],
  diagonal: [17043521, 1118480]
};

export function enabledMasks(patterns: LiveState["settings"]["patterns"]): number[] {
  return [...(patterns.rows ? LINE_MASKS.row : []), ...(patterns.columns ? LINE_MASKS.column : []), ...(patterns.diagonals ? LINE_MASKS.diagonal : [])];
}

export function popcount(mask: number): number {
  let count = 0;
  for (let value = mask >>> 0; value; value &= value - 1) count += 1;
  return count;
}

/** Solve a question from its own text (never from the server's reveal). */
export function solve(question: Question): { n: number; d: number } {
  if (question.kind === "fraction") {
    const [n, d] = question.text.split("/").map(Number);
    return { n, d };
  }
  const match = /^(\d+) ([+−×÷]) (\d+)$/.exec(question.text);
  if (!match) throw new Error(`Unreadable question ${question.text}`);
  const a = Number(match[1]);
  const b = Number(match[3]);
  const value = { "+": a + b, "−": a - b, "×": a * b, "÷": a / b }[match[2]]!;
  expect(Number.isInteger(value) && value >= 0).toBe(true);
  return { n: value, d: 1 };
}

export function matches(settings: LiveState["settings"], answer: { n: number; d: number }, cell: Cell): boolean {
  if (cell.free) return false;
  if (settings.mode === "fractions") return settings.equivalentFractions ? answer.n * cell.d === cell.n * answer.d : answer.n === cell.n && answer.d === cell.d;
  return cell.d === 1 && cell.n === answer.n;
}

export async function state(page: Page): Promise<LiveState> {
  return page.evaluate(() => (window as unknown as { __MATH_BINGO_LIVE__: { state: unknown } }).__MATH_BINGO_LIVE__.state) as Promise<LiveState>;
}

export async function waitFor(page: Page, predicate: (current: LiveState) => boolean, message: string, timeout = 30_000): Promise<LiveState> {
  let last: LiveState | null = null;
  await expect.poll(async () => {
    last = await state(page);
    return Boolean(last) && predicate(last);
  }, { message, timeout }).toBe(true);
  return last!;
}

/**
 * Every helper that interacts brings its page to the front first, like the
 * real device whose screen is in front of its user. (Headless WebKit pauses
 * animation frames in background pages, which stalls click actionability.)
 */
export async function front(page: Page): Promise<void> {
  await page.bringToFront();
}

/** Uncaught page errors from every page the helpers opened. */
export const PAGE_ERRORS: string[] = [];

// WebKit reports a fetch that a deliberate page reload cancels as a page
// error ("... due to access control checks"); the app handles the rejection.
const RELOAD_CANCELLED = /due to access control checks.?$/;

export function watchErrors(page: Page): void {
  page.on("pageerror", error => {
    if (RELOAD_CANCELLED.test(error.message)) return;
    PAGE_ERRORS.push(`${page.url()}: ${error.message}`);
  });
}

/**
 * A real click on a card cell. Headless WebKit can pause animation frames in
 * a page that is not focused, which stalls the "stable" actionability check;
 * after a short normal attempt the click is retried at the same point.
 */
export async function press(page: Page, selector: string): Promise<void> {
  await front(page);
  const target = page.locator(selector);
  try {
    await target.click({ timeout: 5_000 });
  } catch {
    try {
      await target.click({ force: true, timeout: 5_000 });
    } catch {
      // Last resort for a starved background WebKit page: the same click
      // event on the same button (its own handler decides what happens).
      await target.dispatchEvent("click");
    }
  }
}

export async function newContext(browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL, ...options });
  if (process.env.BINGO_DEBUG) {
    context.on("page", page => {
      page.on("console", message => console.log("[console]", message.type(), message.text()));
      page.on("pageerror", error => console.log("[pageerror]", error.message));
    });
  }
  return context;
}

export async function signInTeacher(browser: Browser, options: BrowserContextOptions = {}): Promise<{ context: BrowserContext; page: Page }> {
  expect(TEACHER.password.length).toBeGreaterThan(8);
  const context = await newContext(browser, options);
  const page = await context.newPage();
  watchErrors(page);
  await page.goto(`/sign-in?next=${encodeURIComponent(HOST_ROUTE)}`);
  await front(page);
  await page.getByLabel("Email address").fill(TEACHER.email);
  await page.locator('input[name="password"]').first().fill(TEACHER.password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  await page.waitForURL(url => url.pathname === HOST_ROUTE, { timeout: 90_000 });
  await expect(page.locator("body[data-screen]")).not.toHaveAttribute("data-screen", "loading", { timeout: 90_000 });
  return { context, page };
}

export type GameOptions = Partial<{
  mode: string;
  level: string;
  questionSeconds: number;
  revealSeconds: number;
  winners: number;
  rows: boolean;
  columns: boolean;
  diagonals: boolean;
  freeSpace: boolean;
  equivalentFractions: boolean;
  music: string;
  celebration: string;
}>;

async function setCheckbox(page: Page, name: string, value: boolean) {
  const box = page.locator(`input[name="${name}"]`);
  if ((await box.isChecked()) !== value) await box.click({ force: true });
}

/** Choose settings on the real setup form and press CREATE GAME. */
export async function createGame(page: Page, options: GameOptions = {}): Promise<LiveState> {
  // A previous test may have left a live room: end it to start from setup.
  if ((await page.locator("body").getAttribute("data-screen")) !== "setup") {
    // Closing the room returns the host screen to setup on its own (no reload,
    // which would cancel in-flight polls).
    await closeRoom(page);
    await expect(page.locator("body")).toHaveAttribute("data-screen", "setup", { timeout: 30_000 });
  }
  await front(page);
  const radio = async (name: string, value: string | number) => page.locator(`input[name="${name}"][value="${value}"]`).click({ force: true });
  if (options.mode) await radio("mode", options.mode);
  if (options.level) await radio("level", options.level);
  if (options.questionSeconds !== undefined) await radio("questionSeconds", options.questionSeconds);
  if (options.revealSeconds !== undefined) await radio("revealSeconds", options.revealSeconds);
  if (options.winners !== undefined) {
    if ([1, 2, 3, 5, 10, 0].includes(options.winners)) await radio("winners", options.winners);
    else await page.locator("#winners-custom").fill(String(options.winners));
  }
  for (const key of ["rows", "columns", "diagonals", "freeSpace", "equivalentFractions"] as const) {
    if (options[key] !== undefined) await setCheckbox(page, key, options[key]!);
  }
  if (options.music) await radio("music", options.music);
  if (options.celebration) await radio("celebration", options.celebration);
  await page.getByRole("button", { name: "CREATE GAME" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "lobby");
  return waitFor(page, current => /^[1-9]\d{5}$/.test(current.code), "room code");
}

export async function joinPlayer(browser: Browser, code: string, name: string, options: BrowserContextOptions = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await newContext(browser, options);
  const page = await context.newPage();
  watchErrors(page);
  await page.goto(`${JOIN_ROUTE}?code=${code}`);
  await front(page);
  await expect(page.getByLabel("GAME CODE")).toHaveValue(code);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("DISPLAY NAME").fill(name);
  await page.getByRole("button", { name: "Join game" }).click();
  await expect(page.getByText("You're in!")).toBeVisible();
  return { context, page };
}

/**
 * Press START GAME and wait for question 1 (the 3 s countdown advances on
 * the server clock, so clicking "Start now" could race it).
 */
export async function startGame(page: Page): Promise<LiveState> {
  await front(page);
  const before = await state(page);
  await page.getByRole("button", { name: "START GAME" }).click();
  return waitFor(page, current => current.gameNumber > before.gameNumber && current.phase === "QUESTION_ACTIVE" && current.questionNumber === 1, "question 1 after the countdown");
}

/** Press the host's main control (Start now / Reveal answer / Next question). */
export async function hostNext(page: Page): Promise<LiveState> {
  const button = page.locator(".controls .button-primary");
  const ended = (current: LiveState) => current.phase === "WINNER_REVEAL" || current.phase === "GAME_COMPLETE";
  // A Bingo can end the game between a player's mark and the host's poll.
  await expect.poll(async () => ended(await state(page)) || ((await button.count()) > 0 && (await button.isEnabled())), { timeout: 20_000 }).toBe(true);
  const before = await state(page);
  if (ended(before)) return before;
  await front(page);
  await button.click();
  return waitFor(page, current => current.phase !== before.phase || current.questionNumber !== before.questionNumber, "host advanced");
}

/**
 * Mark the matching cell that does the most for this player's best line.
 * With `hold`, a player never completes a line yet (used to script the
 * order in which Bingos happen).
 */
export async function markBest(page: Page, { hold = false } = {}): Promise<{ result: string; cell: number } | null> {
  const current = await state(page);
  if (current.phase !== "QUESTION_ACTIVE" || !current.question || !current.me?.board || current.me.hasWon || current.me.markUsed) return null;
  const answer = solve(current.question);
  const masks = enabledMasks(current.settings.patterns);
  let best: { cell: number; score: number } | null = null;
  current.me.board.forEach((cell, index) => {
    if (((current.me!.marks >>> index) & 1) === 1 || !matches(current.settings, answer, cell)) return;
    const next = current.me!.marks | (1 << index);
    const score = Math.max(...masks.map(mask => popcount(next & mask)));
    if (hold && score >= 5) return;
    if (!best || score > best.score) best = { cell: index, score };
  });
  if (!best) return null;
  const chosen = best as { cell: number; score: number };
  await front(page);
  const response = page.waitForResponse(reply => reply.url().endsWith("/api/games/math-bingo-live/play") && (reply.request().postData() ?? "").includes("\"mark\""));
  await press(page, `[data-cell="${chosen.cell}"]`);
  const payload = await (await response).json();
  return { result: payload.result, cell: chosen.cell };
}

/** Tap a cell that does NOT match (for private wrong-answer feedback). */
export async function markWrong(page: Page): Promise<{ result: string; cell: number } | null> {
  const current = await state(page);
  if (current.phase !== "QUESTION_ACTIVE" || !current.question || !current.me?.board) return null;
  const answer = solve(current.question);
  const index = current.me.board.findIndex((cell, cellIndex) => !cell.free && ((current.me!.marks >>> cellIndex) & 1) === 0 && !matches(current.settings, answer, cell));
  if (index < 0) return null;
  await front(page);
  const response = page.waitForResponse(reply => reply.url().endsWith("/api/games/math-bingo-live/play") && (reply.request().postData() ?? "").includes("\"mark\""));
  await press(page, `[data-cell="${index}"]`);
  return { result: (await (await response).json()).result, cell: index };
}

export async function useFreeSpace(page: Page): Promise<string> {
  await front(page);
  const star = page.locator('[data-cell="12"]');
  await press(page, '[data-cell="12"]');
  // The first tap only arms the star (a stray tap never spends it).
  await expect(star).toHaveClass(/is-armed/);
  await expect(page.locator(".toast")).toContainText("Tap the star again");
  const response = page.waitForResponse(reply => reply.url().endsWith("/api/games/math-bingo-live/play") && (reply.request().postData() ?? "").includes("\"free\""), { timeout: 30_000 });
  await press(page, '[data-cell="12"]');
  return (await (await response).json()).result;
}

export function cardSignature(board: Cell[]): string {
  return board.filter(cell => !cell.free).map(cell => `${cell.n}/${cell.d}`).sort().join(",");
}

export function cardLayout(board: Cell[]): string {
  return board.map(cell => (cell.free ? "F" : `${cell.n}/${cell.d}`)).join(",");
}

export async function closeRoom(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const token = sessionStorage.getItem("mathnexa:math-bingo-live:host-token");
    if (token) await fetch("/api/games/math-bingo-live/host", { method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin", body: JSON.stringify({ action: "close", hostToken: token }) });
  });
}
