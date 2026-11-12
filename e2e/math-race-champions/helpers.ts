import { mkdirSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

export const PLAY_ROUTE = "/games/math-race-champions/play";
export const BASE_URL = process.env.MATH_RACE_CHAMPIONS_URL ?? "http://127.0.0.1:3103";
export const EVIDENCE_DIR = process.env.RACE_EVIDENCE_DIR ?? "test-results/math-race-champions/evidence";

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
  const context = await browser.newContext({ baseURL: BASE_URL, ...options });
  const page = await context.newPage();
  watchErrors(page);
  return { context, page };
}

export async function signIn(page: Page, account: Account, next = PLAY_ROUTE): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(account.email);
  await page.locator('input[name="password"]').first().fill(account.password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').first().click();
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
