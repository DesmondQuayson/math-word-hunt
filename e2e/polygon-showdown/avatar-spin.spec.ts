import { expect, test, type Page } from "@playwright/test";

import { adminClient, newPage, PLAY_ROUTE, resetAccount, setBalance, SHOPPER, signIn, waitForScreen } from "./helpers";

type StageDebug = { mode: string; framing: string; yaw: number; spinning: boolean; frames: number; dragging: boolean; reducedMotion: boolean; camera: { y: number; distance: number; pitch: number } | null };

const stage = (page: Page): Promise<StageDebug> =>
  page.evaluate(() => (window as unknown as { __POLYGON_SHOWDOWN__: { shop: { avatarView: { debug(): StageDebug } } } }).__POLYGON_SHOWDOWN__.shop.avatarView.debug());

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const game = (window as unknown as { __POLYGON_SHOWDOWN__?: { shop?: { avatarView?: { debug(): unknown } } } }).__POLYGON_SHOWDOWN__;
    return game?.shop?.avatarView?.debug() != null;
  }, null, { timeout: 60_000 });
  await expect(page.locator("#stage-controls")).toBeVisible();
}

const card = (page: Page, item: string) => page.locator(`.product-card[data-item="${item}"]`);

async function openShop(page: Page): Promise<void> {
  await page.goto(`${PLAY_ROUTE}#shop`);
  await waitForScreen(page, "shop");
  await ready(page);
}

/** Yaw only ever grows while it spins, so the change is a clean measure of speed. */
async function spinRate(page: Page, ms = 2_400): Promise<number> {
  const a = await stage(page);
  await page.waitForTimeout(ms);
  const b = await stage(page);
  return (b.yaw - a.yaw) / (ms / 1000);
}

test.describe("the avatar turns", () => {
  test("slow automatic 360 at about one turn in ten seconds, paused by a drag, resumed after idle", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    await signIn(page, SHOPPER);
    await openShop(page);

    await page.waitForTimeout(1_200); // the spin eases in
    const rate = await spinRate(page);
    expect(rate * 8).toBeLessThan(Math.PI * 2 * 1.05); // no faster than a turn in 8 s
    expect(rate * 12).toBeGreaterThan(Math.PI * 2 * 0.95); // no slower than a turn in 12 s
    expect((await stage(page)).spinning).toBe(true);

    // Mouse drag: the avatar follows, the spin stops.
    const box = await page.locator("#avatar-stage canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    const before = (await stage(page)).yaw;
    await page.mouse.move(middle.x + 90, middle.y, { steps: 4 });
    await page.waitForTimeout(120);
    const during = await stage(page);
    expect(during.dragging).toBe(true);
    expect(during.spinning).toBe(false);
    expect(during.yaw).toBeGreaterThan(before + 0.5);

    // It does not fight the person holding it.
    await page.waitForTimeout(800);
    expect(Math.abs((await stage(page)).yaw - during.yaw)).toBeLessThan(0.02);
    await page.mouse.up();

    // A short pause, then it resumes by itself.
    const released = await stage(page);
    expect(released.spinning).toBe(false);
    await page.waitForTimeout(1_000);
    expect((await stage(page)).spinning).toBe(false);
    await page.waitForFunction(() => {
      const view = (window as unknown as { __POLYGON_SHOWDOWN__: { shop: { avatarView: { debug(): { spinning: boolean } } } } }).__POLYGON_SHOWDOWN__.shop.avatarView.debug();
      return view.spinning;
    }, null, { timeout: 6_000 });

    await context.close();
  });

  test("the rotate buttons turn it and hold the spin, and the keyboard can reach them", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    await signIn(page, SHOPPER);
    await openShop(page);

    const a = await stage(page);
    await page.locator("#rotate-right").click();
    await page.waitForTimeout(700);
    const b = await stage(page);
    expect(b.yaw - a.yaw).toBeGreaterThan(0.55);
    expect(b.spinning).toBe(false);

    await page.locator("#rotate-left").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    const c = await stage(page);
    expect(c.yaw).toBeLessThan(b.yaw - 0.55);
    await expect(page.locator("#rotate-left")).toHaveAttribute("aria-label", "Rotate left");
    await expect(page.locator("#rotate-right")).toHaveAttribute("aria-label", "Rotate right");

    await context.close();
  });

  test("with reduced motion it stays still, and the buttons still turn it", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    await signIn(page, SHOPPER);
    await openShop(page);

    const a = await stage(page);
    expect(a.reducedMotion).toBe(true);
    expect(a.spinning).toBe(false);
    await page.waitForTimeout(1_500);
    expect((await stage(page)).yaw).toBe(a.yaw);

    await page.locator("#rotate-right").click();
    await page.waitForTimeout(250);
    expect((await stage(page)).yaw - a.yaw).toBeCloseTo(Math.PI / 4, 2);

    await context.close();
  });

  test("Try On and Equip happen while it keeps turning, framed for the item", async ({ browser }) => {
    const admin = adminClient();
    const id = await resetAccount(admin, SHOPPER.email);
    await setBalance(admin, id, 1_000);
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    await signIn(page, SHOPPER);
    await openShop(page);

    await page.locator('.tab[data-tab="shoes"]').click();
    await card(page, "shoes-canvas").click();
    await page.waitForTimeout(900);
    const product = await stage(page);
    expect(product.mode).toBe("product");
    await expect(page.locator("#stage-frame")).toHaveClass(/product/);

    // Try On: the avatar appears, already turning, looking at the feet.
    await page.waitForFunction(() => {
      const view = (window as unknown as { __POLYGON_SHOWDOWN__: { shop: { avatarView: { debug(): { spinning: boolean } } } } }).__POLYGON_SHOWDOWN__.shop.avatarView.debug();
      return view.spinning;
    }, null, { timeout: 6_000 });
    await page.locator("#detail-try").click();
    await page.waitForTimeout(700);
    const trying = await stage(page);
    expect(trying.mode).toBe("avatar");
    expect(trying.framing).toBe("feet");
    expect(trying.spinning).toBe(true);
    await expect(page.locator("#stage-frame")).not.toHaveClass(/product/);
    await expect(page.locator(".frame-chip.on")).toHaveCount(0);

    const a = await stage(page);
    await page.waitForTimeout(1_200);
    expect((await stage(page)).yaw).toBeGreaterThan(a.yaw + 0.3);

    // Buying and equipping does not stop or restart it.
    await page.locator("#detail-buy").click();
    await page.getByRole("dialog").getByRole("button", { name: "Buy", exact: true }).click();
    await expect(page.locator("#detail-equip")).toBeVisible();
    await page.locator("#detail-equip").click();
    await expect(card(page, "shoes-canvas").locator(".state-tag")).toHaveText("EQUIPPED");
    const equipped = await stage(page);
    expect(equipped.mode).toBe("avatar");
    expect(equipped.framing).toBe("feet");

    const after = await stage(page);
    await page.waitForTimeout(1_200);
    expect((await stage(page)).yaw).toBeGreaterThan(after.yaw + 0.3);

    // Outfit persists through a refresh.
    await page.reload();
    await waitForScreen(page, "shop");
    await ready(page);
    const saved = await page.evaluate(() => (window as unknown as { __POLYGON_SHOWDOWN__: { session: { avatar: { shoes: string } } } }).__POLYGON_SHOWDOWN__.session.avatar.shoes);
    expect(saved).toBe("shoes-canvas");

    await context.close();
  });

  test("each kind of item gets its own camera, and Full, Upper and Face work", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    await signIn(page, SHOPPER);
    await page.goto(`${PLAY_ROUTE}#avatar`);
    await waitForScreen(page, "avatar");
    await ready(page);

    const expectFraming = async (tab: string, nth: number, framing: string): Promise<void> => {
      await page.locator(`.tab[data-tab="${tab}"]`).click();
      await page.locator(".product-card").nth(nth).click();
      await page.waitForTimeout(600);
      expect((await stage(page)).framing, tab).toBe(framing);
    };
    await expectFraming("hair", 2, "face");
    await expectFraming("facial-hair", 1, "face");
    await expectFraming("makeup", 1, "face");
    await expectFraming("tops", 0, "upper");
    await expectFraming("shoes", 1, "feet");
    await expectFraming("bottoms", 1, "legs");

    const wide = (await stage(page)).camera?.distance ?? 0;
    await page.locator('.frame-chip[data-framing="full"]').click();
    await page.waitForTimeout(700);
    const full = await stage(page);
    expect(full.framing).toBe("full");
    expect(full.camera?.distance ?? 0).toBeGreaterThan(wide);
    await expect(page.locator('.frame-chip[data-framing="full"]')).toHaveAttribute("aria-pressed", "true");

    await page.locator('.frame-chip[data-framing="face"]').click();
    await page.waitForTimeout(700);
    const face = await stage(page);
    expect(face.framing).toBe("face");
    expect(face.camera?.distance ?? 99).toBeLessThan(full.camera?.distance ?? 0);

    await context.close();
  });

  test("a finger can turn it without stealing the page's scroll", async ({ browser, browserName }) => {
    const admin = adminClient();
    await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await signIn(page, SHOPPER);
    await openShop(page);

    const box = await page.locator("#avatar-stage canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    const touchAction = await page.locator("#avatar-stage canvas").evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe("pan-y");

    const x0 = box.x + box.width * 0.3;
    const x1 = box.x + box.width * 0.75;
    const y = box.y + box.height * 0.5;
    const started = await stage(page);
    // Real touch input where the browser allows it, otherwise the same pointer
    // events a finger produces.
    const client = browserName === "chromium" ? await context.newCDPSession(page) : null;
    const canvas = page.locator("#avatar-stage canvas");
    const pointer = async (type: string, x: number) => {
      await canvas.evaluate((element, event) => {
        element.dispatchEvent(new PointerEvent(event.type, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: event.x, clientY: event.y, bubbles: true, cancelable: true }));
      }, { type, x, y });
    };
    if (client) await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
    else await pointer("pointerdown", x0);
    for (let step = 1; step <= 8; step += 1) {
      const x = x0 + ((x1 - x0) * step) / 8;
      if (client) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      else await pointer("pointermove", x);
      await page.waitForTimeout(24);
    }
    const held = await stage(page);
    expect(held.dragging).toBe(true);
    expect(held.spinning).toBe(false);
    expect(held.yaw).toBeGreaterThan(started.yaw + 0.5);
    if (client) await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await pointer("pointerup", x1);
    await page.waitForTimeout(150);
    expect((await stage(page)).dragging).toBe(false);

    await context.close();
  });

  test("shop cards show real product renders, and a product opens large", async ({ browser }) => {
    const admin = adminClient();
    const id = await resetAccount(admin, SHOPPER.email);
    await setBalance(admin, id, 120);
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    await signIn(page, SHOPPER);
    await openShop(page);

    const first = page.locator(".product-card img").first();
    await expect(first).toBeVisible();
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>(".product-card img");
      return Boolean(image && image.complete && image.naturalWidth > 0);
    });
    const source = await first.evaluate((image: HTMLImageElement) => image.currentSrc);
    expect(source).toMatch(/\/internal-games\/polygon-showdown\/products\/top-[a-z-]+-(200|400)\.(avif|webp)\?v=/);

    await page.locator('.tab[data-tab="shoes"]').click();
    const buyCard = card(page, "shoes-canvas");
    await expect(buyCard.locator(".state-tag")).toHaveText("BUY");
    await expect(buyCard).toHaveAttribute("aria-label", /Canvas Lows.*40 coins.*Buy/);

    await buyCard.click();
    await expect(page.locator("#detail-name")).toHaveText("Canvas Lows");
    await expect(page.locator("#detail-price")).toContainText("40");
    await expect(page.locator("#detail-balance")).toContainText("120");
    await expect(page.locator("#detail-try")).toBeVisible();
    await expect(page.locator("#detail-buy")).toBeEnabled();

    // Closing puts the avatar back.
    await page.locator("#detail-close").click();
    await expect(page.locator("#product-detail")).toBeHidden();
    await page.waitForTimeout(300);
    expect((await stage(page)).mode).toBe("avatar");

    await context.close();
  });
});
