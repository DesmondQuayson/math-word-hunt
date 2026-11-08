import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

import { allLegalMoves, decodeBoard, type GameState } from "../../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

export const PLAY_ROUTE = "/games/polygon-showdown/play";
export const BASE_URL = process.env.POLYGON_SHOWDOWN_URL ?? "http://127.0.0.1:3102";

type Account = { email: string; password: string };
const accounts = JSON.parse(process.env.POLYGON_ACCOUNTS ?? "{}") as Record<string, Account>;
export const OWNER = accounts.owner;
export const CREATOR = accounts.creator;
export const JOINER = accounts.joiner;
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

export async function setBalance(admin: SupabaseClient, id: string, balance: number): Promise<void> {
  const { error } = await admin.from("polygon_wallets").upsert({ user_id: id, balance });
  if (error) throw error;
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

type Controller = "solo" | "showdown";

export async function gameState(page: Page, controller: Controller): Promise<GameState> {
  return page.evaluate((key) => {
    const hook = (window as unknown as { __POLYGON_SHOWDOWN__: Record<string, { game: { state: GameState } }> }).__POLYGON_SHOWDOWN__;
    return hook[key].game.state;
  }, controller) as Promise<GameState>;
}

export async function gameIdle(page: Page, controller: Controller): Promise<void> {
  await page.waitForFunction((key) => {
    const hook = (window as unknown as { __POLYGON_SHOWDOWN__: Record<string, { game: { busy: boolean } }> }).__POLYGON_SHOWDOWN__;
    return !hook[key].game.busy;
  }, controller, { timeout: 30_000, polling: 100 });
}

/** Everything sent to and confirmed by the server. */
export async function saved(page: Page, controller: Controller, timeout = 30_000): Promise<void> {
  await page.waitForFunction((key) => {
    const hook = (window as unknown as { __POLYGON_SHOWDOWN__: Record<string, { game: { pending: unknown[] } }> }).__POLYGON_SHOWDOWN__;
    return hook[key].game.pending.length === 0;
  }, controller, { timeout, polling: 150 });
}

export async function clickCell(page: Page, cell: number): Promise<void> {
  await page.bringToFront();
  await page.locator(`.cell[data-cell="${cell}"]`).click({ timeout: 10_000 });
}

/** One real legal move, made with two real clicks on the board. */
export async function playMove(page: Page, controller: Controller): Promise<GameState> {
  await gameIdle(page, controller);
  const state = await gameState(page, controller);
  const moves = allLegalMoves(decodeBoard(state.board), 8, 8);
  expect(moves.length).toBeGreaterThan(0);
  const [a, b] = moves[0];
  await clickCell(page, a);
  await clickCell(page, b);
  await page.waitForFunction(([key, count]) => {
    const hook = (window as unknown as { __POLYGON_SHOWDOWN__: Record<string, { game: { state: GameState; busy: boolean } }> }).__POLYGON_SHOWDOWN__;
    return hook[key as string].game.state.moves > (count as number) && !hook[key as string].game.busy;
  }, [controller, state.moves] as const, { timeout: 30_000, polling: 100 });
  return gameState(page, controller);
}

export async function playMoves(page: Page, controller: Controller, count: number): Promise<GameState> {
  let state = await gameState(page, controller);
  for (let index = 0; index < count; index += 1) state = await playMove(page, controller);
  return state;
}

export async function joinAsGuest(browser: Browser, code: string, name: string, emoji: string | null, options: BrowserContextOptions = {}): Promise<{ context: BrowserContext; page: Page }> {
  const { context, page } = await newPage(browser, options);
  await page.goto(`/join?code=${code}`);
  await page.locator("#name").fill(name);
  if (emoji) await page.getByRole("button", { name: emoji, exact: true }).click({ timeout: 10_000 });
  await page.locator("#join-game").click();
  await waitForScreen(page, "lobby").catch(async () => waitForScreen(page, "showdown"));
  return { context, page };
}

export async function createShowdown(page: Page, name: string, minutes = 5, difficulty: "standard" | "challenge" = "standard"): Promise<string> {
  await page.goto(`${PLAY_ROUTE}#create`);
  await waitForScreen(page, "create");
  await page.locator(`[data-minutes="${minutes}"]`).click();
  await page.locator(`[data-difficulty="${difficulty}"]`).click();
  await page.locator("#creator-name").fill(name);
  await page.locator("#create-game").click();
  await waitForScreen(page, "lobby");
  return (await page.locator("#join-code").textContent())!.trim();
}

export async function waitForBoardLive(page: Page, timeout = 30_000): Promise<void> {
  await waitForScreen(page, "showdown", timeout);
  await page.waitForFunction(() => !document.querySelector(".board")?.classList.contains("locked"), null, { timeout, polling: 150 });
}

/** Moves the room's buzzer: the rule under test stays the server's own clock. */
export async function endRoomIn(admin: SupabaseClient, code: string, seconds: number): Promise<void> {
  const { error } = await admin.from("polygon_rooms").update({ ends_at: new Date(Date.now() + seconds * 1000).toISOString() }).eq("code", code).eq("status", "open");
  if (error) throw error;
}

export async function waitForResults(page: Page, timeout = 60_000): Promise<void> {
  await page.locator("#results").waitFor({ timeout });
}

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
