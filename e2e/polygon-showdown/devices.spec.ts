import { expect, test } from "@playwright/test";

import { adminClient, assertNoHorizontalScroll, createShowdown, CREATOR, joinAsGuest, newPage, OWNER, playMoves, PLAY_ROUTE, resetAccount, signIn, waitForBoardLive, waitForScreen } from "./helpers";

const VIEWPORTS = [
  { name: "phone-small", width: 320, height: 568 },
  { name: "phone", width: 360, height: 740 },
  { name: "iphone", width: 390, height: 844 },
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "smart-board", width: 1920, height: 1080 }
];

for (const viewport of VIEWPORTS) {
  test(`Solo fits and plays at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser, { viewport: { width: viewport.width, height: viewport.height } });
    await signIn(page, OWNER);
    await waitForScreen(page, "hub");
    await assertNoHorizontalScroll(page);
    await page.goto(`${PLAY_ROUTE}#solo`);
    await waitForScreen(page, "solo");

    const box = (await page.locator(".board").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
    // Finger-sized cells even on the smallest phone.
    expect(box.width / 8).toBeGreaterThanOrEqual(viewport.width < 400 ? 34 : 44);
    await assertNoHorizontalScroll(page);

    const end = (await page.locator("#end-run").boundingBox())!;
    expect(end.y + end.height).toBeLessThanOrEqual(box.y + 1);

    const state = await playMoves(page, "solo", 2);
    expect(state.coins).toBeGreaterThanOrEqual(2);
    await context.close();
  });

  test(`Showdown from one device at ${viewport.width}x${viewport.height}: create, share, start, play`, async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, CREATOR.email);
    const { context, page } = await newPage(browser, { viewport: { width: viewport.width, height: viewport.height } });
    await signIn(page, CREATOR);
    const code = await createShowdown(page, "Desmond");
    await assertNoHorizontalScroll(page);
    await expect(page.locator(".qr-code")).toBeVisible();
    await expect(page.locator("#join-code")).toHaveText(code);
    await expect(page.locator("#start-showdown")).toBeVisible();

    const guest = await joinAsGuest(browser, code, "Ava", "Rocket", { viewport: { width: viewport.width, height: viewport.height } });
    await page.locator("#start-showdown").click();
    await Promise.all([waitForBoardLive(page), waitForBoardLive(guest.page)]);

    for (const screenPage of [page, guest.page]) {
      await assertNoHorizontalScroll(screenPage);
      const box = (await screenPage.locator(".board").boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      // The board stays the biggest thing on the screen.
      expect(box.width * box.height).toBeGreaterThan(viewport.width * viewport.height * 0.3);
    }
    await playMoves(page, "showdown", 1);
    await expect(page.locator("#showdown-coins")).not.toHaveText("0");
    await Promise.all([context.close(), guest.context.close()]);
  });

  test(`Shop fits at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, OWNER.email);
    const { context, page } = await newPage(browser, { viewport: { width: viewport.width, height: viewport.height } });
    await signIn(page, OWNER);
    await page.goto(`${PLAY_ROUTE}#shop`);
    await waitForScreen(page, "shop");
    await assertNoHorizontalScroll(page);
    await expect(page.locator("#avatar-stage")).toBeVisible();
    await expect(page.locator("article.item-card").first()).toBeVisible();
    await context.close();
  });
}
