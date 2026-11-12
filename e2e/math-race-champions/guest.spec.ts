import { expect, test } from "@playwright/test";

import { BASE_URL, PAGE_ERRORS, PLAY_ROUTE, adminClient, api, evidence, newPage, raceAnswer, waitForGo, waitForScreen } from "./helpers";

const CODE = process.env.RACE_SCHOOL_CODE ?? "";

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

async function count(table: string): Promise<number> {
  const { count: total, error } = await adminClient().from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return total ?? 0;
}

const TABLES = ["race_wallets", "race_profiles", "race_runs", "race_garage", "race_ledger", "race_stage_progress"] as const;
const snapshot = async () => Object.fromEntries(await Promise.all(TABLES.map(async (table) => [table, await count(table)] as const)));

test.describe("a school access session", () => {
  test.skip(!CODE, "needs RACE_SCHOOL_CODE");

  test("can play everything, and nothing permanent is ever written for it", async ({ browser }) => {
    test.setTimeout(300_000);
    const before = await snapshot();
    const { context, page } = await newPage(browser, { viewport: { width: 1024, height: 768 } });
    await page.goto(`${BASE_URL}/access?next=${encodeURIComponent(PLAY_ROUTE)}`);
    await page.getByLabel("Code (required)").fill(CODE);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => url.pathname === PLAY_ROUTE, { timeout: 60_000 });
    await waitForScreen(page, "hub");

    // Race Computer is a practice mode: no wallet, every car to try, nothing to buy.
    await page.getByRole("button", { name: /Race Computer/ }).click();
    await waitForScreen(page, "computer");
    await expect(page.locator(".notice").first()).toContainText("Practice mode");
    await expect(page.locator(".wallet")).toHaveCount(0);
    await evidence(page, "guest-stages-1024x768");
    await page.getByRole("button", { name: "Garage" }).click();
    await waitForScreen(page, "garage");
    await page.locator('.car-tab[data-car="thunder-x"]').click();
    await expect(page.locator('[data-action="buy"]')).toHaveCount(0);
    await expect(page.locator('[data-action="equip"]')).toHaveCount(0);
    await expect(page.locator('[data-action="try"]')).toBeEnabled();

    // Everything that would write permanent progress is refused by the server.
    expect((await api(page, "account", { action: "bootstrap" })).body).toMatchObject({ guest: true });
    expect((await api(page, "account", { action: "race-start", stage: 1, categories: "mixed", difficulty: "easy" })).status).toBe(403);
    expect((await api(page, "account", { action: "purchase", car: "turbo-sprint", key: "school-key-0001" })).status).toBe(403);
    expect((await api(page, "account", { action: "equip", car: "starter" })).status).toBe(403);
    expect((await api(page, "account", { action: "race-sync", run: "00000000-0000-4000-8000-000000000000" })).status).toBe(403);

    // A practice race runs in the tab with the same rules.
    await page.getByRole("button", { name: "Back to the stages" }).click();
    await waitForScreen(page, "computer");
    await page.getByRole("button", { name: "Start race" }).click();
    await waitForScreen(page, "race");
    await expect(page.locator(".hud-mode")).toHaveText("Stage 1 practice");
    await waitForGo(page, 120_000);
    for (let index = 0; index < 3; index += 1) await raceAnswer(page, true);
    await page.getByRole("button", { name: "Leave the race" }).click();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await waitForScreen(page, "computer");

    // It may create an Online Race room (it is an eligible player), still with no account behind it.
    const room = await api(page, "account", { action: "create-room", name: "School", emoji: null, colour: "green", categories: "mixed", difficulty: "easy" });
    expect(room.status).toBe(200);
    expect((room.body.room as { me: { signedIn: boolean } }).me.signedIn).toBe(false);
    expect((await api(page, "account", { action: "host", hostToken: room.body.hostToken, command: "close" })).body.result).toBe("closed");

    // My Progress says so plainly.
    await page.getByRole("button", { name: "Back to the game menu" }).click();
    await page.getByRole("button", { name: "My Progress" }).click();
    await waitForScreen(page, "progress");
    await expect(page.locator(".notice")).toContainText("no saved progress");

    expect(await snapshot()).toEqual(before);
    await context.close();
  });

  test("an anonymous visitor is sent to sign in, and the API refuses them", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto(PLAY_ROUTE);
    await page.waitForURL((url) => url.pathname === "/access", { timeout: 60_000 });
    expect(new URL(page.url()).searchParams.get("next")).toBe(PLAY_ROUTE);
    expect((await api(page, "account", { action: "bootstrap" })).status).toBe(401);
    expect((await api(page, "account", { action: "create-room", name: "Anon", colour: "green", categories: "mixed", difficulty: "easy" })).status).toBe(401);
    // A request from another site (no game header) is refused before anything else.
    const foreign = await page.evaluate(async () => (await fetch("/api/games/math-race-champions/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
    expect(foreign).toBe(403);
    await context.close();
  });
});
