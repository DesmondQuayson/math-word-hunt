import { mkdirSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

import { DIVIDE, MINUS, SUPERSCRIPTS, TIMES, decimalsEqual, parseConversion, parseDecimal, shiftDecimal } from "../../apps/platform-web/public/internal-games/math-race-champions/src/engine/questions.js";

export const PLAY_ROUTE = "/games/math-race-champions/play";
export const BASE_URL = process.env.MATH_RACE_CHAMPIONS_URL ?? "http://127.0.0.1:3103";
export const EVIDENCE_DIR = process.env.RACE_EVIDENCE_DIR ?? "qa-artifacts/math-race-champions/evidence";
/** A hosted staging preview (scripts/review-math-race-champions-staging.mjs): Vercel's bypass cookie comes in a storage state, and sign-ins after the first are minted. */
export const STAGING = process.env.RACE_STAGING === "1";
const STORAGE_STATE = process.env.RACE_STORAGE_STATE;

type Account = { email: string; password: string };
const accounts = JSON.parse(process.env.RACE_ACCOUNTS ?? "{}") as Record<string, Account>;
export const OWNER = accounts.owner;
export const RACER = accounts.racer;
export const CREATOR = accounts.creator;
export const SHOPPER = accounts.shopper;

export function adminClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function userId(admin: SupabaseClient, email: string): Promise<string> {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = listed.data.users.find((entry) => entry.email === email);
  if (!user) throw new Error(`No test account ${email}`);
  return user.id;
}

/**
 * Back to a brand-new account: nothing earned, bought or saved. The ledger can
 * not be edited, even by the application, so this replaces the whole (synthetic)
 * account: deleting a user is the one thing that removes its progress.
 */
export async function resetAccount(admin: SupabaseClient, email: string): Promise<string> {
  const account = Object.values(accounts).find((entry) => entry.email === email);
  if (!account) throw new Error(`Unknown test account ${email}`);
  const removed = await admin.auth.admin.deleteUser(await userId(admin, email));
  if (removed.error) throw removed.error;
  const created = await admin.auth.admin.createUser({ email, password: account.password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Account unavailable.");
  return created.data.user.id;
}

export const PAGE_ERRORS: string[] = [];
const RELOAD_CANCELLED = /due to access control checks.?$/;

export function watchErrors(page: Page): void {
  page.on("pageerror", (error) => {
    if (RELOAD_CANCELLED.test(error.message)) return;
    PAGE_ERRORS.push(`${page.url()}: ${error.message}`);
  });
}

export async function newPage(browser: Browser, options: BrowserContextOptions = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL, ...(STORAGE_STATE ? { storageState: STORAGE_STATE } : {}), ...options });
  const page = await context.newPage();
  watchErrors(page);
  return { context, page };
}

let formSignIns = 0;

export async function signIn(page: Page, account: Account, next = PLAY_ROUTE): Promise<void> {
  if (STAGING && formSignIns >= 1) {
    // Staging's sign-in form allows 20 attempts per 15 minutes; once per spec file exercises it.
    const { sessionCookies } = await import("../../scripts/polygon-showdown-staging-session.mjs");
    const { cookies } = await sessionCookies(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SECRET_KEY!, account.email, account.password);
    await page.context().addCookies(cookies.map(({ name, value }: { name: string; value: string }) => ({ name, value, url: BASE_URL, sameSite: "Lax" as const })));
    await page.goto(next);
  } else {
    formSignIns += 1;
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    await page.getByLabel("Email address").fill(account.email);
    await page.locator('input[name="password"]').first().fill(account.password);
    await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
  }
  await page.waitForURL((url) => url.pathname === next, { timeout: 120_000 });
  await page.waitForFunction(() => document.body.dataset.screen !== "loading", null, { timeout: 60_000 });
}

export const screen = (page: Page) => page.evaluate(() => document.body.dataset.screen);

export async function waitForScreen(page: Page, name: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction((target) => document.body.dataset.screen === target, name, { timeout, polling: 150 });
}

export async function assertNoScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
}

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

export async function evidence(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

// ------------------------------------------------------------- classroom

export type Team = "turquoise" | "pink";

type ClassroomHook = { classroom: { match: { phase: string; length: number; team(team: Team): { position: number; remaining: number; correct: number; wrong: number; question: { correctIndex: 0 | 1; text: string; category: string; key: string } } } } };

export const teamState = (page: Page, team: Team) =>
  page.evaluate((key) => {
    const view = (window as unknown as { __MATH_RACE__: ClassroomHook }).__MATH_RACE__.classroom.match.team(key as Team);
    return { position: view.position, remaining: view.remaining, correct: view.correct, wrong: view.wrong, correctIndex: view.question.correctIndex, text: view.question.text, category: view.question.category, key: view.question.key };
  }, team);

export const classroomPhase = (page: Page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: ClassroomHook }).__MATH_RACE__.classroom.match.phase);

export const choice = (page: Page, team: Team, index: number) => page.locator(`.cr-choice[data-team="${team}"][data-choice="${index}"]`);

/** Hub → set-up (defaults: Mixed Skills) → the board, started and past the countdown. */
export async function openClassroom(page: Page, options: { length?: 62 | 30; difficulty?: string; names?: Partial<Record<Team, string>>; start?: boolean } = {}): Promise<void> {
  await waitForScreen(page, "hub");
  await page.getByRole("button", { name: /Classroom Competition/ }).click();
  await waitForScreen(page, "classroom-setup");
  if (options.difficulty) await page.locator(`label[for="classroom-difficulty-${options.difficulty}"]`).click();
  if (options.length) await page.locator(`label[for="classroom-length-${options.length}"]`).click();
  if (options.names?.turquoise) await page.locator("#classroom-name-turquoise").fill(options.names.turquoise);
  if (options.names?.pink) await page.locator("#classroom-name-pink").fill(options.names.pink);
  await page.getByRole("button", { name: "Continue to the board" }).click();
  await waitForScreen(page, "classroom");
  if (options.start === false) return;
  await page.getByRole("button", { name: "Start the race" }).click();
  await page.waitForFunction(() => document.querySelector(".classroom")?.getAttribute("data-phase") === "playing", null, { timeout: 15_000, polling: 100 });
}

/** One real press of the correct (or the wrong) button, then wait for the buttons to wake. */
export async function answer(page: Page, team: Team, correctly: boolean): Promise<void> {
  const state = await teamState(page, team);
  const index = correctly ? state.correctIndex : state.correctIndex === 0 ? 1 : 0;
  await choice(page, team, index).click();
  await page.waitForFunction(
    ([key, previous]) => {
      const hook = (window as unknown as { __MATH_RACE__: ClassroomHook }).__MATH_RACE__.classroom.match;
      const button = document.querySelector<HTMLButtonElement>(`.cr-choice[data-team="${key}"]`);
      return hook.phase !== "playing" || (hook.team(key as Team).question.key !== previous && button !== null && !button.disabled);
    },
    [team, state.key] as const,
    { timeout: 15_000, polling: 50 }
  );
}

// ------------------------------------------------------------------- racing


/**
 * Works a question out from what is on the screen, the way a racer does. The
 * tests never see an answer from the game: in a server-checked race the browser
 * is never sent one.
 */
export function solve(text: string, choices: readonly string[]): 0 | 1 {
  const fits = (choice: string): boolean => {
    const equation = new RegExp(`^(\\d+) ([+${MINUS}${TIMES}${DIVIDE}]) \\? = (\\d+)$`).exec(text);
    if (equation) {
      const first = Number(equation[1]);
      const result = Number(equation[3]);
      const value = Number(choice);
      if (equation[2] === "+") return first + value === result;
      if (equation[2] === MINUS) return first - value === result;
      if (equation[2] === TIMES) return first * value === result;
      return value !== 0 && first === result * value;
    }
    const power = new RegExp(`^(\\d+)([${SUPERSCRIPTS.join("")}]) = \\?$`).exec(text);
    if (power) return Number(choice) === Number(power[1]) ** SUPERSCRIPTS.indexOf(power[2]);
    // "Convert 0.58 to a percent." / "Convert 28% to a decimal."
    const conversion = parseConversion(text);
    if (!conversion) throw new Error(`Unreadable question "${text}"`);
    const right = parseDecimal(choice);
    if (!right || conversion.fromPercent === choice.endsWith("%")) return false;
    return conversion.fromPercent ? decimalsEqual(conversion.value, shiftDecimal(right, 2)) : decimalsEqual(shiftDecimal(conversion.value, 2), right);
  };
  const first = fits(choices[0]);
  const second = fits(choices[1]);
  if (first === second) throw new Error(`Cannot solve "${text}" with ${choices.join(" | ")}`);
  return first ? 0 : 1;
}

type RaceHook = { race: { view(): { progress: number; speed: number; correct: number; wrong: number; finished: boolean; distanceKm: number } | null; rivals(): { id: string; progress: number; finished: boolean }[]; graphics(): string } };

export const raceView = (page: Page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: RaceHook }).__MATH_RACE__.race.view());
export const raceRivals = (page: Page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: RaceHook }).__MATH_RACE__.race.rivals());
export const raceGraphics = (page: Page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: RaceHook }).__MATH_RACE__.race.graphics());

export async function shownQuestion(page: Page): Promise<{ text: string; choices: string[] }> {
  return page.evaluate(() => ({
    text: document.querySelector(".race-question")?.textContent ?? "",
    choices: [...document.querySelectorAll(".race-choice-label")].map((node) => node.textContent ?? "")
  }));
}

/** Wait for the lights to go out and the answer buttons to wake. */
export async function waitForGo(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => document.querySelector(".race")?.getAttribute("data-phase") === "racing" && !document.querySelector<HTMLButtonElement>(".race-choice")?.disabled, null, { timeout, polling: 100 });
}

/** One answer in a race: correct or deliberately wrong, pressed for real, then wait for the buttons to wake (or the race to end). */
export async function raceAnswer(page: Page, correctly = true): Promise<void> {
  const question = await shownQuestion(page);
  const right = solve(question.text, question.choices);
  const index = correctly ? right : right === 0 ? 1 : 0;
  try {
    await page.locator(`.race-choice[data-choice="${index}"]`).click({ timeout: 25_000 });
  } catch (error) {
    // The clock can carry the car over the line between reading the question and pressing.
    if (await raceFinished(page)) return;
    throw error;
  }
  await page.waitForFunction(
    (previous) => {
      const race = document.querySelector(".race");
      if (race?.getAttribute("data-phase") === "finished") return true;
      const button = document.querySelector<HTMLButtonElement>(".race-choice");
      return button !== null && !button.disabled && document.querySelector(".race-question")?.textContent !== previous;
    },
    question.text,
    { timeout: 20_000, polling: 50 }
  ).catch(async () => {
    // The same question text can legitimately come up twice in a row across categories; the buttons waking is enough.
    await page.waitForFunction(() => document.querySelector(".race")?.getAttribute("data-phase") === "finished" || !document.querySelector<HTMLButtonElement>(".race-choice")?.disabled, null, { timeout: 10_000, polling: 50 });
  });
}

export const raceFinished = (page: Page) => page.evaluate(() => document.querySelector(".race")?.getAttribute("data-phase") === "finished");

/** Race to the finish answering correctly, with `wrong` deliberate mistakes spread in. Returns answers given. */
export async function raceToFinish(page: Page, { wrong = 0, maxAnswers = 400 }: { wrong?: number; maxAnswers?: number } = {}): Promise<number> {
  let answers = 0;
  let mistakes = 0;
  while (!(await raceFinished(page)) && answers < maxAnswers) {
    const enabled = await page.evaluate(() => !document.querySelector<HTMLButtonElement>(".race-choice")?.disabled);
    if (!enabled) {
      await page.waitForTimeout(150);
      continue;
    }
    const mistake = mistakes < wrong && answers > 0 && answers % 9 === 4;
    await raceAnswer(page, !mistake);
    if (mistake) mistakes += 1;
    answers += 1;
  }
  return answers;
}

/** A same-origin API call made by the page itself, exactly as the game makes it. */
export async function api(page: Page, endpoint: "account" | "play", body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ([path, payload]) => {
      const response = await fetch(`/api/games/math-race-champions/${path}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-race-champions" },
        body: JSON.stringify(payload)
      });
      return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
    },
    [endpoint, body] as const
  );
}

/** Test data only: marks Stages 1 to `upTo - 1` as won, which opens Stage `upTo`. */
export async function openStages(admin: SupabaseClient, id: string, upTo: number): Promise<void> {
  const now = new Date().toISOString();
  const rows = Array.from({ length: upTo - 1 }, (_, index) => ({ user_id: id, stage: index + 1, plays: 1, wins: 1, first_won_at: now }));
  const { error } = await admin.from("race_stage_progress").upsert(rows, { onConflict: "user_id,stage", ignoreDuplicates: true });
  if (error) throw error;
}

export async function setBalance(admin: SupabaseClient, id: string, balance: number): Promise<void> {
  const { error } = await admin.from("race_wallets").upsert({ user_id: id, balance });
  if (error) throw error;
}

export async function ledger(admin: SupabaseClient, id: string): Promise<{ event: string; amount: number; balance_after: number; idempotency_key: string }[]> {
  const { data, error } = await admin.from("race_ledger").select("event,amount,balance_after,idempotency_key").eq("user_id", id).order("id");
  if (error) throw error;
  return data ?? [];
}