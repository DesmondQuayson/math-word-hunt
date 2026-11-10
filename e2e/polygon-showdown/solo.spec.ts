import { expect, test } from "@playwright/test";

import { adminClient, gameState, newPage, OWNER, PAGE_ERRORS, playMoves, PLAY_ROUTE, resetAccount, saved, signIn, waitForScreen } from "./helpers";

test.describe("signed-in Solo", () => {
  test("a run survives closing the browser, and continues on another device", async ({ browser }) => {
    const admin = adminClient();
    const id = await resetAccount(admin, OWNER.email);

    // First visit: a new account sees the plain choices.
    const first = await newPage(browser);
    await signIn(first.page, OWNER);
    await waitForScreen(first.page, "hub");
    await expect(first.page.locator("#play-solo")).toBeVisible();
    await expect(first.page.locator("#create-showdown")).toBeVisible();
    await expect(first.page.locator("#continue-solo")).toHaveCount(0);
    await expect(first.page.locator("#hub-title")).not.toContainText("WELCOME BACK");

    // Start Solo, make matches, earn coins.
    await first.page.locator("#play-solo").click();
    await waitForScreen(first.page, "solo");
    await expect(first.page.locator(".board")).not.toHaveClass(/locked/);
    const after = await playMoves(first.page, "solo", 4);
    expect(after.coins).toBeGreaterThanOrEqual(4);
    expect(after.matches).toBeGreaterThanOrEqual(4);
    await expect(first.page.locator("#run-coins")).toHaveText(String(after.coins));
    await saved(first.page, "solo");
    const boardBefore = after.board;

    // Leave without pressing anything else, and close the browser.
    await first.context.close();

    // Later, in a new browser: sign in, and the game recognises the account.
    const later = await newPage(browser);
    await signIn(later.page, OWNER);
    await waitForScreen(later.page, "hub");
    await expect(later.page.locator("#hub-title")).toContainText("WELCOME BACK");
    await expect(later.page.locator("#hub-coins")).toContainText(String(after.coins));
    await expect(later.page.locator("#hub-combo")).toHaveText(`×${after.bestCombo}`);
    await expect(later.page.locator("#continue-solo")).toBeVisible();
    await expect(later.page.locator("#new-run")).toBeVisible();
    await expect(later.page.locator("#open-shop")).toBeVisible();
    await expect(later.page.locator("#create-showdown")).toBeVisible();

    // CONTINUE SOLO restores the same board and the same run.
    await later.page.locator("#continue-solo").click();
    await waitForScreen(later.page, "solo");
    const resumed = await gameState(later.page, "solo");
    expect(resumed.board).toBe(boardBefore);
    expect(resumed.coins).toBe(after.coins);
    expect(resumed.moves).toBe(after.moves);

    // And it keeps earning from there.
    const more = await playMoves(later.page, "solo", 2);
    expect(more.coins).toBeGreaterThan(after.coins);
    await saved(later.page, "solo");

    // End the run: the summary, and the coins are in the wallet exactly once.
    await later.page.locator("#end-run").click();
    await later.page.getByRole("dialog").getByRole("button", { name: "End Run" }).click();
    await waitForScreen(later.page, "run-summary");
    await expect(later.page.locator("#summary-wallet")).toContainText(String(more.coins));

    const wallet = await admin.from("polygon_wallets").select("balance").eq("user_id", id).single();
    expect(wallet.data?.balance).toBe(more.coins);
    const ledger = await admin.from("polygon_ledger").select("amount,event").eq("user_id", id);
    expect(ledger.data?.every((row) => row.event === "EARN_SOLO")).toBe(true);
    expect(ledger.data?.reduce((sum, row) => sum + row.amount, 0)).toBe(more.coins);
    const run = await admin.from("polygon_solo_runs").select("status").eq("user_id", id);
    expect(run.data?.every((row) => row.status === "ended")).toBe(true);

    // Reloading afterwards pays nothing more.
    await later.page.goto(PLAY_ROUTE);
    await waitForScreen(later.page, "hub");
    await expect(later.page.locator("#play-solo")).toBeVisible();
    const again = await admin.from("polygon_wallets").select("balance").eq("user_id", id).single();
    expect(again.data?.balance).toBe(more.coins);

    await later.context.close();
    expect(PAGE_ERRORS).toEqual([]);
  });

  test("refusing a fabricated save: the server's replay decides", async ({ browser }) => {
    const admin = adminClient();
    const id = await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");

    const replies = await page.evaluate(async () => {
      const hook = (window as unknown as { __POLYGON_SHOWDOWN__: { solo: { runId: string; game: { state: { moves: number }; acked: number }; saver: { epoch: number } } } }).__POLYGON_SHOWDOWN__.solo;
      const send = async (body: Record<string, unknown>) => {
        const response = await fetch("/api/games/polygon-showdown/account", {
          method: "POST",
          credentials: "same-origin",
          referrerPolicy: "same-origin",
          headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
          body: JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
      };
      const base = { action: "solo-sync", run: hook.runId, epoch: hook.saver.epoch, from: 0 };
      return {
        claim: await send({ ...base, moves: [], coins: 50000, balance: 50000, checkpoint: true }),
        far: await send({ ...base, moves: [[0, 2, 100]] }),
        wrongRun: await send({ ...base, run: "11111111-1111-1111-1111-111111111111", moves: [] })
      };
    });
    expect(replies.claim.body.coins).toBe(0);
    expect(replies.far.body.result).toBe("resync");
    expect(replies.far.body.rejected).toBe("not-adjacent");
    expect(replies.wrongRun.status).toBe(404);
    const wallet = await admin.from("polygon_wallets").select("balance").eq("user_id", id).single();
    expect(wallet.data?.balance).toBe(0);
    await context.close();
  });

  test("two windows: the newest owns the run", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");
    await playMoves(page, "solo", 1);
    await saved(page, "solo");
    const other = await context.newPage();
    await other.goto(`${PLAY_ROUTE}#continue`);
    await waitForScreen(other, "solo");
    // The first window's next save finds it has been replaced, and says so.
    await playMoves(page, "solo", 1);
    await expect(page.getByText("This run is now open in another window.")).toBeVisible({ timeout: 20_000 });
    await context.close();
  });

  test("anonymous visitors are sent to sign in, and no exception is made for Solo", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto(PLAY_ROUTE);
    await page.waitForURL((url) => url.pathname !== PLAY_ROUTE, { timeout: 60_000 });
    expect(new URL(page.url()).pathname).not.toBe(PLAY_ROUTE);
    const response = await page.request.post("/api/games/polygon-showdown/account", {
      headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown", "Sec-Fetch-Site": "same-origin" },
      data: { action: "bootstrap" }
    });
    expect(response.status()).toBe(401);
    // A draft is never listed, and never named as a free game (Help and About since v1.2.44).
    for (const path of ["/math-games", "/help", "/about"]) {
      await page.goto(path);
      await expect(page.locator("main"), path).not.toContainText("Polygon Showdown");
    }
    await context.close();
  });
});
