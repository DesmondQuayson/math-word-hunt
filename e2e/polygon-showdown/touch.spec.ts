import { expect, test } from "@playwright/test";

import { adminClient, gameIdle, gameState, newPage, OWNER, PLAY_ROUTE, resetAccount, signIn, waitForScreen } from "./helpers";

import { allLegalMoves, decodeBoard } from "../../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

test.describe("touch", () => {
  test("a phone swaps by tap-tap and by dragging, and the page does not scroll under the finger", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");

    const centre = async (cell: number) => {
      const box = (await page.locator(`.cell[data-cell="${cell}"]`).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    // Tap one shape, then its neighbour.
    let state = await gameState(page, "solo");
    let [a, b] = allLegalMoves(decodeBoard(state.board), 8, 8)[0];
    let from = await centre(a);
    let to = await centre(b);
    await page.touchscreen.tap(from.x, from.y);
    await page.touchscreen.tap(to.x, to.y);
    await page.waitForFunction((count) => (window as unknown as { __POLYGON_SHOWDOWN__: { solo: { game: { state: { moves: number } } } } }).__POLYGON_SHOWDOWN__.solo.game.state.moves > count, state.moves, { polling: 100 });
    await gameIdle(page, "solo");

    // Drag a shape onto its neighbour with a real touch gesture.
    state = await gameState(page, "solo");
    [a, b] = allLegalMoves(decodeBoard(state.board), 8, 8)[0];
    from = await centre(a);
    to = await centre(b);
    const client = await context.newCDPSession(page);
    const touch = (type: string, points: Array<{ x: number; y: number }>) => client.send("Input.dispatchTouchEvent", { type: type as "touchStart", touchPoints: points });
    await touch("touchStart", [from]);
    await touch("touchMove", [{ x: from.x + (to.x - from.x) * 0.5, y: from.y + (to.y - from.y) * 0.5 }]);
    await touch("touchMove", [to]);
    await touch("touchEnd", []);
    await page.waitForFunction((count) => (window as unknown as { __POLYGON_SHOWDOWN__: { solo: { game: { state: { moves: number } } } } }).__POLYGON_SHOWDOWN__.solo.game.state.moves > count, state.moves, { polling: 100 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.locator(".board").evaluate((element) => getComputedStyle(element).touchAction)).toBe("none");
    await context.close();
  });
});
