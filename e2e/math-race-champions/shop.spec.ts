import { expect, test, type Page } from "@playwright/test";

import { PAGE_ERRORS, SHOPPER, adminClient, api, evidence, ledger, newPage, raceAnswer, resetAccount, setBalance, signIn, waitForGo, waitForScreen } from "./helpers";

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

async function openGarage(page: Page): Promise<void> {
  await waitForScreen(page, "hub");
  // The garage is reached from Race Computer, not from the game menu.
  await expect(page.getByRole("button", { name: "Garage" })).toHaveCount(0);
  await page.getByRole("button", { name: /Race Computer/ }).click();
  await waitForScreen(page, "computer");
  await page.getByRole("button", { name: "Garage" }).click();
  await waitForScreen(page, "garage");
  await expect(page.locator(".car-tab")).toHaveCount(4);
}

const showroom = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".showroom-canvas")!;
    return { model: canvas.dataset.model ?? null, azimuth: Number(canvas.dataset.azimuth), zoom: Number(canvas.dataset.zoom) };
  });

async function waitForShowroom(page: Page, model: string): Promise<void> {
  await page.waitForFunction((key) => document.querySelector<HTMLCanvasElement>(".showroom-canvas")?.dataset.model === key && document.querySelector<HTMLCanvasElement>(".showroom-canvas")?.dataset.azimuth !== undefined, model, { timeout: 60_000, polling: 100 });
}

const turns = (value: number) => ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

test.describe("the garage and car shop", () => {
  test("three premium cars at 2,000, 4,000 and 6,000; a turning 3D preview of the car that races", async ({ browser }) => {
    test.setTimeout(300_000);
    const admin = adminClient();
    await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await signIn(page, SHOPPER);
    await openGarage(page);

    expect(await page.locator(".car-tab-name").allTextContents()).toEqual(["Street Starter", "Turbo Sprint", "Velocity GT", "Thunder X"]);
    expect(await page.locator(".car-tab-state").allTextContents()).toEqual(["Equipped", "R$ 2,000", "R$ 4,000", "R$ 6,000"]);
    await expect(page.locator(".wallet strong")).toHaveText("R$ 0");
    await expect(page.locator(".fine-print")).toContainText("play money");
    await expect(page.locator(".fine-print")).toContainText("no cash value");

    // The starter: free, equipped, with a test drive.
    await waitForShowroom(page, "starter");
    await expect(page.locator(".car-status")).toHaveText("EQUIPPED");
    await expect(page.locator('[data-action="equipped"]')).toBeDisabled();
    await expect(page.locator('[data-action="try"]')).toBeEnabled();

    // It turns by itself.
    const a = await showroom(page);
    await page.waitForTimeout(1200);
    const b = await showroom(page);
    expect(Math.abs(b.azimuth - a.azimuth)).toBeGreaterThan(0.2);

    // Each car shows its own model: the one the race builds from the same key.
    for (const [key, name, price, stages] of [
      ["turbo-sprint", "Turbo Sprint", "R$ 2,000", "Stages 3–6"],
      ["velocity-gt", "Velocity GT", "R$ 4,000", "Stages 7–8"],
      ["thunder-x", "Thunder X", "R$ 6,000", "Stages 9–10"]
    ] as const) {
      await page.locator(`.car-tab[data-car="${key}"]`).click();
      await waitForShowroom(page, key);
      await expect(page.locator(".car-head h2")).toHaveText(name);
      await expect(page.locator(".car-status")).toHaveText(price);
      await expect(page.locator(".car-facts")).toContainText(stages);
      await expect(page.locator(".car-facts")).toContainText("30 correct answers, like every car");
      // No Race Dollars yet: BUY is off, and the shortfall is spelled out.
      await expect(page.locator('[data-action="buy"]')).toBeDisabled();
      await expect(page.locator(".car-short")).toContainText(price);
      await expect(page.locator(".stat")).toHaveCount(3);
      await evidence(page, `garage-${key}-1366x768`);
    }

    // Front, side and rear views.
    for (const [view, angle] of [["front", 0], ["side", Math.PI / 2], ["rear", Math.PI]] as const) {
      await page.locator(`.showroom-tools [data-view="${view}"]`).click();
      await page.waitForFunction(([target]) => {
        const value = Number(document.querySelector<HTMLCanvasElement>(".showroom-canvas")!.dataset.azimuth);
        const wrapped = ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return Math.min(Math.abs(wrapped - target), Math.PI * 2 - Math.abs(wrapped - target)) < 0.02;
      }, [angle] as const, { timeout: 10_000, polling: 50 });
    }

    // Mouse drag turns the car: half the width is half a turn.
    const box = (await page.locator(".showroom-canvas").boundingBox())!;
    const before = await showroom(page);
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const dragged = await showroom(page);
    expect(Math.abs(turns(before.azimuth - dragged.azimuth) - Math.PI)).toBeLessThan(0.25);

    // Touch drag does the same.
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".showroom-canvas")!;
      const rect = canvas.getBoundingClientRect();
      const fire = (type: string, x: number) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31, pointerType: "touch", isPrimary: true, button: 0, clientX: rect.left + rect.width * x, clientY: rect.top + rect.height / 2 }));
      fire("pointerdown", 0.6);
      fire("pointermove", 0.5);
      fire("pointermove", 0.35);
      fire("pointerup", 0.35);
    });
    await page.waitForTimeout(150);
    const touched = await showroom(page);
    expect(Math.abs(turns(touched.azimuth - dragged.azimuth) - Math.PI / 2)).toBeLessThan(0.25);

    // Zoom: the buttons and the wheel.
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(100);
    const zoomed = await showroom(page);
    expect(zoomed.zoom).toBeGreaterThan(touched.zoom);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    expect((await showroom(page)).zoom).toBeLessThan(zoomed.zoom);
    await context.close();
  });

  test("buying is decided by the server: prices, funds, double presses, ownership, equipping, another device", async ({ browser }) => {
    test.setTimeout(420_000);
    const admin = adminClient();
    const shopperId = await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await signIn(page, SHOPPER);
    await waitForScreen(page, "hub");

    // Nothing in the wallet: nothing can be bought, and a price sent by the browser is ignored.
    const poor = await api(page, "account", { action: "purchase", car: "turbo-sprint", key: "poor-attempt-0001", price: 0, amount: -5000 });
    expect(poor.body).toMatchObject({ result: "insufficient", balance: 0, price: 2000 });
    expect((await api(page, "account", { action: "purchase", car: "moon-rocket", key: "nonexistent-0001" })).status).toBe(404);
    expect((await api(page, "account", { action: "purchase", car: "starter", key: "free-car-key-0001" })).status).toBe(404);
    expect((await api(page, "account", { action: "purchase", car: "turbo-sprint", key: "short" })).status).toBe(400);
    expect((await api(page, "account", { action: "equip", car: "thunder-x" })).status).toBe(403);
    expect((await api(page, "account", { action: "equip", car: "moon-rocket" })).status).toBe(404);
    expect(await ledger(admin, shopperId)).toEqual([]);

    // Local review money (this is the only way a balance appears without racing, and only in local Supabase).
    await setBalance(admin, shopperId, 12_000);

    // Buy Turbo Sprint through the screen.
    await page.getByRole("button", { name: /Race Computer/ }).click();
    await waitForScreen(page, "computer");
    await page.getByRole("button", { name: "Garage" }).click();
    await waitForScreen(page, "garage");
    await expect(page.locator(".wallet strong")).toHaveText("R$ 12,000");
    await page.locator('.car-tab[data-car="turbo-sprint"]').click();
    await page.locator('[data-action="buy"]').click();
    await expect(page.locator("#buy-title")).toHaveText("Buy Turbo Sprint?");
    await expect(page.locator(".result-card .result-note")).toContainText("R$ 10,000 left");
    // A double press on the confirm button is one purchase.
    await page.locator(".result-card .button-primary").dblclick();
    await expect(page.locator(".car-status")).toHaveText("OWNED", { timeout: 20_000 });
    await expect(page.locator(".wallet strong")).toHaveText("R$ 10,000");
    expect(await ledger(admin, shopperId)).toMatchObject([{ event: "PURCHASE_CAR", amount: -2000, balance_after: 10_000 }]);
    await evidence(page, "garage-owned-1366x768");

    // Equip it.
    await page.locator('[data-action="equip"]').click();
    await expect(page.locator(".car-status")).toHaveText("EQUIPPED", { timeout: 20_000 });
    expect(await page.locator(".car-tab-state").allTextContents()).toEqual(["Owned", "Equipped", "R$ 4,000", "R$ 6,000"]);

    // The same request again (a retry): the first answer, no second charge.
    const first = await api(page, "account", { action: "purchase", car: "velocity-gt", key: "velocity-attempt-01" });
    expect(first.body).toMatchObject({ result: "ok", balance: 6000, price: 4000 });
    const retry = await api(page, "account", { action: "purchase", car: "velocity-gt", key: "velocity-attempt-01" });
    expect(retry.body).toMatchObject({ result: "ok", idempotent: true, balance: 6000 });
    // A new attempt for a car already owned charges nothing.
    expect((await api(page, "account", { action: "purchase", car: "velocity-gt", key: "velocity-attempt-02" })).body).toMatchObject({ result: "owned", balance: 6000 });

    // Two purchases of the last car at the same instant: exactly one charge.
    const pair = await page.evaluate(async () => {
      const buy = (key: string) =>
        fetch("/api/games/math-race-champions/account", {
          method: "POST",
          credentials: "same-origin",
          referrerPolicy: "same-origin",
          headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-race-champions" },
          body: JSON.stringify({ action: "purchase", car: "thunder-x", key })
        }).then((response) => response.json());
      return Promise.all([buy("thunder-attempt-aa"), buy("thunder-attempt-bb")]);
    });
    expect(pair.map((reply: { result: string }) => reply.result).sort()).toEqual(["ok", "owned"]);
    const lines = await ledger(admin, shopperId);
    expect(lines.map((line) => line.amount)).toEqual([-2000, -4000, -6000]);
    expect(lines.map((line) => line.balance_after)).toEqual([10_000, 6000, 0]);
    expect(Math.min(...lines.map((line) => line.balance_after))).toBeGreaterThanOrEqual(0);
    // Empty wallet: nothing more, never below zero.
    expect((await api(page, "account", { action: "bootstrap" })).body).toMatchObject({ balance: 0, equipped: "turbo-sprint" });

    // The ledger cannot be rewritten, even by the application's own key.
    const edit = await admin.from("race_ledger").update({ amount: -1 }).eq("user_id", shopperId).select();
    expect(edit.error).not.toBeNull();
    const remove = await admin.from("race_ledger").delete().eq("user_id", shopperId).select();
    expect(remove.error).not.toBeNull();

    // The server races the equipped car, whatever the browser says.
    const run = await api(page, "account", { action: "race-start", stage: 1, categories: "mixed", difficulty: "easy", car: "thunder-x" });
    expect((run.body.run as { car: { key: string } }).car.key).toBe("turbo-sprint");
    await api(page, "account", { action: "race-quit", run: (run.body.run as { id: string }).id });
    await context.close();

    // Another device: the cars and the equipped car are there.
    const other = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await signIn(other.page, SHOPPER);
    await openGarage(other.page);
    expect(await other.page.locator(".car-tab-state").allTextContents()).toEqual(["Owned", "Equipped", "Owned", "Owned"]);
    await expect(other.page.locator(".wallet strong")).toHaveText("R$ 0");
    await evidence(other.page, "garage-390x844");

    // TRY CAR: a test drive in the tab. Same car model, nothing earned, nothing charged.
    await other.page.locator('.car-tab[data-car="thunder-x"]').click();
    await other.page.locator('[data-action="try"]').click();
    await waitForScreen(other.page, "race");
    await expect(other.page.locator(".hud-mode")).toHaveText("Trying Thunder X");
    await waitForGo(other.page, 120_000);
    for (let index = 0; index < 3; index += 1) await raceAnswer(other.page, true);
    await evidence(other.page, "race-try-car-390x844");
    await other.page.getByRole("button", { name: "Leave the race" }).click();
    await other.page.getByRole("button", { name: "Leave", exact: true }).click();
    await waitForScreen(other.page, "garage");
    expect((await ledger(admin, shopperId)).length).toBe(3);
    await other.context.close();
  });
});
