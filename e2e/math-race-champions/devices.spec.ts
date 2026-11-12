import { expect, test, type Page } from "@playwright/test";

import { OWNER, PAGE_ERRORS, api, assertNoHorizontalScroll, assertNoScroll, choice, evidence, newPage, openClassroom, raceAnswer, raceView, signIn, waitForGo, waitForScreen } from "./helpers";

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

const VIEWPORTS = [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1920, 1080]
] as const;

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function inside(page: Page, selector: string, width: number, height: number): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).not.toBeNull();
  expect(box!.x, selector).toBeGreaterThanOrEqual(-1);
  expect(box!.y, selector).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, selector).toBeLessThanOrEqual(width + 1);
  expect(box!.y + box!.height, selector).toBeLessThanOrEqual(height + 1);
  return box!;
}

for (const [width, height] of VIEWPORTS) {
  test(`${width}x${height}: menu, classroom board, a race, the garage and the room form all fit`, async ({ browser }) => {
    test.setTimeout(420_000);
    const touch = width < 800;
    const { context, page } = await newPage(browser, { viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await signIn(page, OWNER);
    await waitForScreen(page, "hub");

    // ---- The game menu ----
    for (const name of [/Classroom Competition/, /Race Computer/, /Online Race/]) await expect(page.getByRole("button", { name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Math Race\s+Champions/i);
    await expect(page.getByText("Solve. Accelerate. Win.")).toBeVisible();
    await assertNoHorizontalScroll(page);
    await evidence(page, `hub-${width}x${height}`);

    // ---- Classroom Competition: both teams' questions and buttons on screen, nothing scrolls ----
    await openClassroom(page);
    await assertNoScroll(page);
    for (const team of ["turquoise", "pink"] as const) {
      await inside(page, `.cr-team-${team} .cr-track`, width, height);
      await inside(page, `.cr-team-${team} .cr-question`, width, height);
      for (const index of [0, 1]) {
        const box = await inside(page, `.cr-choice[data-team="${team}"][data-choice="${index}"]`, width, height);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(60);
      }
      expect(await page.locator(`.cr-team-${team} .tile`).count()).toBe(64);
    }
    await evidence(page, `classroom-${width}x${height}`);
    await page.getByRole("button", { name: "Back to the game menu" }).click();
    await waitForScreen(page, "hub");

    // ---- A race: road, question, two answers, speedometer, minimap ----
    await page.getByRole("button", { name: /Race Computer/ }).click();
    await waitForScreen(page, "computer");
    await assertNoHorizontalScroll(page);
    await expect(page.locator(".stage-card")).toHaveCount(10);
    await page.getByRole("button", { name: "Start race" }).click();
    await waitForScreen(page, "race");
    await waitForGo(page, 180_000);
    await assertNoScroll(page);
    const stage = await inside(page, ".race-stage", width, height);
    expect(stage.height).toBeGreaterThanOrEqual(height * 0.4);
    const question = await inside(page, ".race-ask", width, height);
    const buttons = [await inside(page, '.race-choice[data-choice="0"]', width, height), await inside(page, '.race-choice[data-choice="1"]', width, height)];
    for (const box of buttons) {
      expect(box.height).toBeGreaterThanOrEqual(56);
      expect(box.width).toBeGreaterThanOrEqual(120);
      // The answers are under the road, never over the car.
      expect(box.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
    }
    expect(overlap(buttons[0], buttons[1])).toBe(false);
    expect(overlap(question, buttons[0]) || overlap(question, buttons[1])).toBe(false);
    const minimap = await inside(page, ".minimap", width, height);
    const speedo = await inside(page, ".speedo", width, height);
    expect(overlap(minimap, speedo)).toBe(false);
    // Read-outs never sit under the minimap.
    for (const selector of [".hud-chip-race", ".hud-chip-correct", ".hud-quit"]) expect(overlap(await inside(page, selector, width, height), minimap), selector).toBe(false);
    await expect(page.locator(".speedo-number")).toBeVisible();
    await expect(page.locator(".hud-chip-correct .hud-chip-value")).toContainText("/30 minimum");
    await expect(page.locator(".minimap-distance")).toContainText("km");

    // Play: a click, then the keyboard (left and right arrows).
    await raceAnswer(page, true);
    expect((await raceView(page))!.correct).toBe(1);
    if (!touch) {
      const next = await page.evaluate(() => ({ text: document.querySelector(".race-question")!.textContent!, choices: [...document.querySelectorAll(".race-choice-label")].map((node) => node.textContent!) }));
      const { solve } = await import("./helpers");
      await page.locator('.race-choice[data-choice="0"]:not([disabled])').waitFor({ timeout: 15_000 });
      await page.keyboard.press(solve(next.text, next.choices) === 0 ? "ArrowLeft" : "ArrowRight");
      await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { race: { view(): { correct: number } } } }).__MATH_RACE__.race.view().correct === 2, null, { timeout: 15_000 });
    }
    await evidence(page, `race-${width}x${height}`);
    await page.getByRole("button", { name: "Leave the race" }).click();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await waitForScreen(page, "computer");

    // ---- The garage ----
    await page.getByRole("button", { name: "Garage", exact: true }).click();
    await waitForScreen(page, "garage");
    await assertNoHorizontalScroll(page);
    await expect(page.locator(".car-tab")).toHaveCount(4);
    await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>(".showroom-canvas")?.dataset.model !== undefined, null, { timeout: 60_000 });
    const canvas = (await page.locator(".showroom-canvas").boundingBox())!;
    expect(canvas.width).toBeGreaterThanOrEqual(Math.min(width - 40, 280));
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(width + 1);
    await evidence(page, `garage-${width}x${height}`);

    // ---- Online Race: the room form ----
    await page.getByRole("button", { name: "Back to the stages" }).click();
    await page.getByRole("button", { name: "Back to the game menu" }).click();
    await page.getByRole("button", { name: /Online Race/ }).click();
    await waitForScreen(page, "online");
    await assertNoHorizontalScroll(page);
    await expect(page.locator("#creator-name")).toBeVisible();
    await expect(page.locator(".pick-colour")).toHaveCount(8);
    await evidence(page, `online-create-${width}x${height}`);
    await context.close();
  });
}

test("keyboard only: the whole menu, a classroom answer and a garage turn without a pointer", async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
  await signIn(page, OWNER);
  await waitForScreen(page, "hub");
  // Tab reaches the first mode with a visible focus ring; Enter opens it.
  await page.locator(".mode").first().focus();
  expect(await page.locator(".mode").first().evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
  await page.keyboard.press("Enter");
  await waitForScreen(page, "classroom-setup");
  // Every control in the form is reachable in order and is a real button, input or label.
  const stops = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main button, main input, main a[href]")].filter((node) => node.tabIndex >= 0 && !(node as HTMLButtonElement).disabled).length);
  expect(stops).toBeGreaterThanOrEqual(16);
  await page.getByRole("button", { name: "Continue to the board" }).focus();
  await page.keyboard.press("Enter");
  await waitForScreen(page, "classroom");
  await page.keyboard.press("Enter"); // the focused Start button
  await page.waitForFunction(() => document.querySelector(".classroom")?.getAttribute("data-phase") === "playing", null, { timeout: 15_000 });
  await choice(page, "pink", 0).focus();
  expect(await choice(page, "pink", 0).evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");

  // The garage turntable turns with the arrow keys.
  await page.getByRole("button", { name: "Back to the game menu" }).click();
  await page.getByRole("button", { name: /Race Computer/ }).click();
  await page.getByRole("button", { name: "Garage", exact: true }).click();
  await waitForScreen(page, "garage");
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>(".showroom-canvas")?.dataset.azimuth !== undefined, null, { timeout: 60_000 });
  await page.locator('.showroom-tools [data-view="front"]').click();
  await page.waitForTimeout(900);
  await page.locator(".showroom-canvas").focus();
  const before = Number(await page.locator(".showroom-canvas").getAttribute("data-azimuth"));
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  expect(Math.abs(Number(await page.locator(".showroom-canvas").getAttribute("data-azimuth")) - before)).toBeGreaterThan(0.4);
  await context.close();
});

test("reduced motion: no spinning turntable, no pop animations, and the race still runs", async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newPage(browser, { viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  await signIn(page, OWNER);
  await waitForScreen(page, "hub");
  await page.getByRole("button", { name: /Race Computer/ }).click();
  await page.getByRole("button", { name: "Garage", exact: true }).click();
  await waitForScreen(page, "garage");
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>(".showroom-canvas")?.dataset.azimuth !== undefined, null, { timeout: 60_000 });
  const first = await page.locator(".showroom-canvas").getAttribute("data-azimuth");
  await page.waitForTimeout(1500);
  expect(await page.locator(".showroom-canvas").getAttribute("data-azimuth")).toBe(first);
  // A view button still works, at once.
  await page.locator('.showroom-tools [data-view="rear"]').click();
  await page.waitForTimeout(300);
  expect(Number(await page.locator(".showroom-canvas").getAttribute("data-azimuth"))).toBeCloseTo(Math.PI, 2);

  await page.getByRole("button", { name: "Back to the stages" }).click();
  await page.getByRole("button", { name: "Start race" }).click();
  await waitForScreen(page, "race");
  await waitForGo(page, 180_000);
  expect(await page.locator(".race-countdown").evaluate((node) => node.classList.contains("pop"))).toBe(false);
  await raceAnswer(page, true);
  expect((await raceView(page))!.correct).toBe(1);
  await page.getByRole("button", { name: "Leave the race" }).click();
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await context.close();
});

test("music: the approved track starts on the first press without touching the music button, and the choice is remembered", async ({ browser }) => {
  const { context, page } = await newPage(browser, { viewport: { width: 1024, height: 768 } });
  await signIn(page, OWNER);
  await waitForScreen(page, "hub");
  const audio = () => page.evaluate(() => (window as unknown as { __MATH_RACE__: { audio(): { source: string | null; paused: boolean; loop: boolean; volume: number; playAttempts: number; error: string | null } } }).__MATH_RACE__.audio());
  // Nothing plays before a gesture (browsers forbid it, and so do we).
  expect((await audio()).playAttempts).toBe(0);
  // The first real press, on something that is not the music button.
  await page.getByRole("button", { name: "How to Play" }).click();
  await waitForScreen(page, "how-to");
  await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { paused: boolean } } }).__MATH_RACE__.audio().paused === false, null, { timeout: 15_000 });
  const playing = await audio();
  expect(playing.source).toBe("/media/audio/cosmic-candy-catchers.mp3");
  expect(playing.loop).toBe(true);
  expect(playing.volume).toBeGreaterThan(0);
  expect(playing.volume).toBeLessThanOrEqual(0.35);
  expect(playing.error).toBeNull();

  // Sound Settings: music off stops it, shows the credit, and is remembered after a reload.
  await page.getByRole("button", { name: "Back to the game menu" }).click();
  await page.getByRole("button", { name: "Sound Settings" }).click();
  await expect(page.locator(".credit")).toContainText("Cosmic Candy Catchers");
  await expect(page.locator(".credit")).toContainText("Eric Matyas");
  await expect(page.locator(".credit")).toContainText("CC BY 3.0");
  await page.getByRole("switch", { name: "Music" }).click();
  expect((await audio()).paused).toBe(true);
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await waitForScreen(page, "hub");
  await page.getByRole("button", { name: "How to Play" }).click();
  await page.waitForTimeout(800);
  expect((await audio()).paused).toBe(true);
  expect((await api(page, "account", { action: "bootstrap" })).status).toBe(200);
  // Sound effects have their own switch.
  await page.getByRole("button", { name: "Back to the game menu" }).click();
  await page.getByRole("button", { name: "Sound Settings" }).click();
  await expect(page.getByRole("switch", { name: "Music" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Sound effects" })).toHaveAttribute("aria-checked", "true");
  await context.close();
});
