import { expect, test } from "@playwright/test";

import { adminClient, gameIdle, gameState, newPage, OWNER, PLAY_ROUTE, playMove, resetAccount, signIn, waitForScreen } from "./helpers";

import { allLegalMoves, decodeBoard } from "../../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

test.describe("accessibility", () => {
  test("the whole board plays from the keyboard", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");

    // A group of real buttons with one tab stop, each saying what it holds.
    await expect(page.locator(".cell")).toHaveCount(64);
    await expect(page.locator('.cell[tabindex="0"]')).toHaveCount(1);
    const label = await page.locator('.cell[data-cell="0"]').getAttribute("aria-label");
    expect(label).toMatch(/^Row 1, column 1: (Circle|Triangle|Square|Rectangle)\.$/);

    const state = await gameState(page, "solo");
    const [a, b] = allLegalMoves(decodeBoard(state.board), 8, 8)[0];
    await page.locator('.cell[data-cell="0"]').focus();
    for (let step = 0; step < Math.floor(a / 8); step += 1) await page.keyboard.press("ArrowDown");
    for (let step = 0; step < a % 8; step += 1) await page.keyboard.press("ArrowRight");
    await expect(page.locator(`.cell[data-cell="${a}"]`)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator(`.cell[data-cell="${a}"]`)).toHaveAttribute("aria-label", /Picked up\.$/);
    await page.keyboard.press(b === a + 1 ? "ArrowRight" : b === a - 1 ? "ArrowLeft" : b === a + 8 ? "ArrowDown" : "ArrowUp");
    await page.waitForFunction(() => (window as unknown as { __POLYGON_SHOWDOWN__: { solo: { game: { state: { moves: number } } } } }).__POLYGON_SHOWDOWN__.solo.game.state.moves === 1);
    await gameIdle(page, "solo");
    await expect(page.locator(`.cell[data-cell="${b}"]`)).toBeFocused();

    // The result is announced.
    await expect(page.locator("#announcer")).toContainText(/Match|Combo/);
    await context.close();
  });

  test("a focused cell shows a visible focus ring", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");
    await page.locator('.cell[data-cell="0"]').focus();
    await page.keyboard.press("ArrowRight");
    const outline = await page.locator('.cell[data-cell="1"]').evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline.style).toBe("solid");
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(3);
    await context.close();
  });

  test("reduced motion: no flying tiles, no floating numbers, and the game still plays", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser, { reducedMotion: "reduce" });
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");
    const sawMotion = await page.evaluate(() => {
      (window as unknown as { __motionSeen: boolean }).__motionSeen = false;
      const tiles = document.querySelector(".tile-layer")!;
      new MutationObserver(() => {
        if (document.querySelector(".float-coins")) (window as unknown as { __motionSeen: boolean }).__motionSeen = true;
      }).observe(tiles.parentElement!, { childList: true, subtree: true });
      return false;
    });
    expect(sawMotion).toBe(false);
    const state = await playMove(page, "solo");
    expect(state.coins).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => (window as unknown as { __motionSeen: boolean }).__motionSeen)).toBe(false);
    await context.close();
  });

  test("shapes differ by outline, not colour, and a rectangle is never drawn square", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");
    const shapes = await page.evaluate(() => {
      const results: Record<string, string> = {};
      for (const tile of document.querySelectorAll(".tile")) {
        const key = [...tile.classList].find((name) => name.startsWith("tile-"))!;
        results[key] = decodeURIComponent((tile.querySelector("img") as HTMLImageElement).src.split(",")[1]);
      }
      return results;
    });
    expect(Object.keys(shapes).sort()).toEqual(["tile-circle", "tile-rectangle", "tile-square", "tile-triangle"]);
    expect(shapes["tile-circle"]).toContain("<circle");
    expect(shapes["tile-triangle"]).toContain("<polygon");
    const rect = /width="(\d+)" height="(\d+)"/.exec(shapes["tile-rectangle"])!;
    expect(Number(rect[1]) / Number(rect[2])).toBeGreaterThanOrEqual(1.9);
    const square = /width="(\d+)" height="(\d+)"/.exec(shapes["tile-square"])!;
    expect(Number(square[1])).toBe(Number(square[2]));
    await context.close();
  });

  test("music starts only on a first gesture and the setting is remembered", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, OWNER);
    await waitForScreen(page, "hub");
    const snapshot = () => page.evaluate(() => (window as unknown as { __POLYGON_SHOWDOWN__: { audio: { snapshot: () => { source: string | null; paused: boolean; effects: string[] } } } }).__POLYGON_SHOWDOWN__.audio.snapshot());
    await page.locator("#hub-title").click();
    await expect.poll(async () => (await snapshot()).source).toBe("/media/audio/cosmic-candy-catchers.mp3");
    await page.getByRole("button", { name: "Music" }).click();
    await expect.poll(async () => (await snapshot()).paused).toBe(true);
    await page.reload();
    await waitForScreen(page, "hub");
    await expect(page.getByRole("button", { name: "Music" })).toHaveAttribute("aria-pressed", "false");
    await context.close();
  });
});
