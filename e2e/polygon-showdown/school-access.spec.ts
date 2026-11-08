import { expect, test } from "@playwright/test";

import { adminClient, BASE_URL, gameState, newPage, PLAY_ROUTE, playMoves, waitForScreen } from "./helpers";

const CODE = process.env.POLYGON_SCHOOL_CODE ?? "";

async function count(table: string): Promise<number> {
  const { count: total, error } = await adminClient().from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return total ?? 0;
}

test.describe("school access session", () => {
  test.skip(!CODE, "needs POLYGON_SCHOOL_CODE");

  test("is a guest for progression: it can play, and nothing permanent is ever written", async ({ browser }) => {
    const before = { wallets: await count("polygon_wallets"), profiles: await count("polygon_profiles"), runs: await count("polygon_solo_runs"), inventory: await count("polygon_inventory") };

    const { context, page } = await newPage(browser);
    await page.goto(`${BASE_URL}/access?next=${encodeURIComponent(PLAY_ROUTE)}`);
    await page.getByLabel("Code (required)").fill(CODE);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => url.pathname === PLAY_ROUTE, { timeout: 60_000 });
    await waitForScreen(page, "hub");

    await expect(page.getByText("progress here is not saved")).toBeVisible();
    await expect(page.locator("#open-shop")).toHaveCount(0);
    await expect(page.locator("#open-avatar")).toHaveCount(0);

    // Practice runs in the tab: same rules, no server, nothing kept.
    await page.locator("#play-solo").click();
    await waitForScreen(page, "solo");
    await expect(page.locator("#guest-note")).toContainText("not saved");
    const state = await playMoves(page, "solo", 2);
    expect(state.coins).toBeGreaterThanOrEqual(2);
    expect(await gameState(page, "solo")).toMatchObject({ moves: 2 });

    // Everything that would write permanent progress is refused.
    const refused = await page.evaluate(async () => {
      const send = async (action: string, fields: Record<string, unknown> = {}) => {
        const response = await fetch("/api/games/polygon-showdown/account", {
          method: "POST", credentials: "same-origin", referrerPolicy: "same-origin",
          headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
          body: JSON.stringify({ action, ...fields })
        });
        return response.status;
      };
      return {
        start: await send("solo-start"),
        buy: await send("purchase", { item: "hat-beanie", key: "school-key-0001" }),
        avatar: await send("avatar-save", { avatar: {} })
      };
    });
    expect(refused).toEqual({ start: 403, buy: 403, avatar: 403 });

    expect({ wallets: await count("polygon_wallets"), profiles: await count("polygon_profiles"), runs: await count("polygon_solo_runs"), inventory: await count("polygon_inventory") }).toEqual(before);
    await context.close();
  });
});
