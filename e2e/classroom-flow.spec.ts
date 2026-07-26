import { expect, test, type Page } from "@playwright/test";

const housePath = [
  [0.3, 0.54],
  [0.4935, 0.3213],
  [0.8065, 0.4048],
  [0.8065, 0.6752],
  [0.4935, 0.7587],
  [0.3, 0.54],
  [0.09, 0.19]
] as const;

async function configureDeterministicShuffle(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0.999999;
  });
}

async function boardGeometry(page: Page) {
  const canvas = page.getByTestId("tracing-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas is not visible");
  const scale = Number(await canvas.getAttribute("data-transform-scale"));
  const offsetX = Number(await canvas.getAttribute("data-transform-offset-x"));
  const offsetY = Number(await canvas.getAttribute("data-transform-offset-y"));
  return { canvas, box, scale, offsetX, offsetY };
}

async function completeByNodes(page: Page, pauseMs = 0) {
  const { box, scale, offsetX, offsetY } = await boardGeometry(page);
  for (const [x, y] of housePath) {
    await page.mouse.click(
      box.x + offsetX + x * scale,
      box.y + offsetY + y * scale
    );
    if (pauseMs) await page.waitForTimeout(pauseMs);
  }
}

async function completeWithOneGesture(
  page: Page,
  path: ReadonlyArray<readonly [number, number]>
) {
  const { box, scale, offsetX, offsetY } = await boardGeometry(page);
  const screenPoint = ([x, y]: readonly [number, number]) => ({
    x: box.x + offsetX + x * scale,
    y: box.y + offsetY + y * scale
  });
  const start = screenPoint(path[0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of path.slice(1)) {
    const screen = screenPoint(point);
    await page.mouse.move(screen.x, screen.y, { steps: 18 });
  }
  await page.mouse.up();
}

async function beginEasyTurn(page: Page) {
  await configureDeterministicShuffle(page);
  await page.goto("/play?mode=classroom&skipOnboarding=1");
  await page.getByRole("button", { name: "Easy" }).click();
  await page.getByRole("button", { name: /Start New Match/i }).click();
  await page.getByRole("button", { name: /Ready Team A/i }).click();
  await page.getByRole("button", { name: "START TURN" }).click();
}

test("runs a complete two-team classroom round", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await configureDeterministicShuffle(page);
  await page.goto("/play?mode=classroom&skipOnboarding=1");
  await page.getByLabel("Team A name").fill("Blue Comets");
  await page.getByLabel("Team B name").fill("Orange Sparks");
  await page.getByRole("button", { name: "Easy" }).click();
  await page.getByRole("button", { name: /Start New Match/i }).click();

  await expect(page.locator(".round-meta strong")).toHaveText("Little House");
  await page.getByRole("button", { name: /Ready Blue Comets/i }).click();
  await expect(page.getByTestId("timer")).toContainText("30");
  await page.waitForTimeout(600);
  await expect(page.getByTestId("timer")).toContainText("30");

  await page.getByRole("button", { name: "START TURN" }).click();
  await page.waitForTimeout(1100);
  await expect(page.getByTestId("timer")).toContainText(/28|29/);

  await page.getByRole("button", { name: /Pause/i }).click();
  const pausedValue = await page
    .getByTestId("timer")
    .locator("span")
    .innerText();
  await page.waitForTimeout(700);
  await expect(page.getByTestId("timer").locator("span")).toHaveText(
    pausedValue
  );
  await page.getByRole("button", { name: /Resume Turn/i }).click();

  const beforeFailure = Number(
    await page.getByTestId("timer").locator("span").innerText()
  );
  const { box, scale, offsetX, offsetY } = await boardGeometry(page);
  await page.mouse.click(
    box.x + offsetX + 0.5 * scale,
    box.y + offsetY + 0.5 * scale
  );
  await expect(page.getByText("STAY ON THE SHAPE")).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /Try Again/i }).click();
  const afterRetry = Number(
    await page.getByTestId("timer").locator("span").innerText()
  );
  expect(afterRetry).toBeLessThanOrEqual(beforeFailure);
  expect(afterRetry).toBeGreaterThanOrEqual(beforeFailure - 2);

  await page.getByRole("button", { name: /Restart Attempt/i }).click();
  await page.getByRole("button", { name: /Node Mode/i }).click();
  await completeByNodes(page, 250);
  await expect(page.getByText("SHAPE COMPLETE!")).toBeVisible();
  await page.getByRole("button", { name: /Pass to Orange Sparks/i }).click();

  await expect(page.getByText(/same shape/i)).toBeVisible();
  await page.getByRole("button", { name: /Orange Sparks Is Ready/i }).click();
  await expect(page.locator(".round-meta strong")).toHaveText("Little House");
  await page.getByRole("button", { name: "START TURN" }).click();
  await completeByNodes(page, 40);
  await expect(page.getByText("SHAPE COMPLETE!")).toBeVisible();
  await page.getByRole("button", { name: /See Round Result/i }).click();

  await expect(page.getByText(/Orange Sparks SCORES!/i)).toBeVisible();
  await expect(page.locator(".result-overlay p")).toContainText(
    /completed the shape faster/i
  );
  await expect(
    page.getByRole("button", { name: /Fullscreen/i }).first()
  ).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("traces several connected edges in one continuous pointer gesture", async ({
  page
}) => {
  await beginEasyTurn(page);
  await completeWithOneGesture(page, housePath);
  await expect(page.getByText("SHAPE COMPLETE!")).toBeVisible();
  await expect(page.getByTestId("tracing-canvas")).toHaveAttribute(
    "data-trace-state",
    "completed"
  );
});

test("keeps the hidden start secret and rejects a midpoint start", async ({
  page
}) => {
  await beginEasyTurn(page);
  await completeWithOneGesture(page, [
    [0.4, 0.426],
    [0.41, 0.42]
  ]);
  await expect(page.getByText("STAY ON THE SHAPE")).toBeVisible();
});

test("hides graph nodes normally, reveals a hinted start, and fits the shape large", async ({
  page
}) => {
  await beginEasyTurn(page);
  const canvas = page.getByTestId("tracing-canvas");
  await expect(canvas).toHaveAttribute("data-visible-node-markers", "0");
  const coverage = Number(await canvas.getAttribute("data-fit-coverage"));
  expect(coverage).toBeGreaterThanOrEqual(0.78);
  expect(coverage).toBeLessThanOrEqual(0.82);
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(canvas).toHaveAttribute("data-visible-node-markers", "0");
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(canvas).toHaveAttribute("data-visible-node-markers", "1");
});

test("Restart Turn explicitly restores the full timer", async ({ page }) => {
  await beginEasyTurn(page);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("timer").locator("span")).not.toHaveText("30");
  await page.locator(".teacher-menu summary").click();
  await page.getByRole("button", { name: "Restart Turn" }).click();
  await expect(
    page.getByRole("button", { name: "START TURN", exact: true })
  ).toBeVisible();
  await expect(page.getByTestId("timer").locator("span")).toHaveText("30");
});

test("keeps Hidden Start pointer alignment at devicePixelRatio 2", async ({
  browser
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await beginEasyTurn(page);
  await completeWithOneGesture(page, housePath);
  await expect(page.getByText("SHAPE COMPLETE!")).toBeVisible();
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
  await context.close();
});

test("reports a deliberate crossing instead of a generic off-path error", async ({
  page
}) => {
  await beginEasyTurn(page);
  const { box, scale, offsetX, offsetY } = await boardGeometry(page);
  const screenPoint = ([x, y]: readonly [number, number]) => ({
    x: box.x + offsetX + x * scale,
    y: box.y + offsetY + y * scale
  });
  const start = screenPoint(housePath[0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of [housePath[1], housePath[2], [0.8065, 0.55] as const]) {
    const screen = screenPoint(point);
    await page.mouse.move(screen.x, screen.y, { steps: 18 });
  }
  const crossing = screenPoint([0.02, 0.31]);
  await page.mouse.move(crossing.x, crossing.y);
  await page.mouse.up();
  await expect(page.getByText("LINES CROSSED")).toBeVisible();
  await expect(
    page.getByRole("paragraph").filter({
      hasText: "A new trace cannot cross a completed line outside a junction."
    })
  ).toBeVisible();
  const canvas = page.getByTestId("tracing-canvas");
  expect(Number(await canvas.getAttribute("data-failure-x"))).toBeCloseTo(
    0.4,
    1
  );
  expect(Number(await canvas.getAttribute("data-failure-y"))).toBeCloseTo(
    0.43,
    1
  );
  const completedBefore = await canvas.getAttribute("data-completed-units");
  await page.mouse.move(start.x, start.y);
  await expect(canvas).toHaveAttribute("data-trace-state", "failed");
  await expect(canvas).toHaveAttribute(
    "data-completed-units",
    completedBefore ?? "0"
  );
});

test("New Showdown clears a finished match and starts fresh", async ({
  page
}) => {
  await configureDeterministicShuffle(page);
  await page.goto("/play?mode=classroom&skipOnboarding=1");
  await page.locator('label:has-text("Winning score") input').fill("1");
  await page.getByRole("button", { name: "Easy" }).click();
  await page.getByRole("button", { name: /Start New Match/i }).click();
  const previousPuzzle = await page.locator(".round-meta strong").innerText();
  await page.getByRole("button", { name: /Ready Team A/i }).click();
  await page.getByRole("button", { name: "START TURN" }).click();
  await page.getByRole("button", { name: /Node Mode/i }).click();
  await completeByNodes(page);
  await page.getByRole("button", { name: /Pass to Team B/i }).click();
  await page.getByRole("button", { name: /Team B Is Ready/i }).click();
  await page.getByRole("button", { name: "START TURN" }).click();
  const { box, scale, offsetX, offsetY } = await boardGeometry(page);
  await page.mouse.click(
    box.x + offsetX + 0.5 * scale,
    box.y + offsetY + 0.5 * scale
  );
  await page.getByRole("button", { name: "End Turn" }).click();
  await page.getByRole("button", { name: "See Final Winner" }).click();
  const newShowdown = page.getByRole("button", { name: "New Showdown" });
  await newShowdown.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: /Start New Match/i })
  ).toBeVisible();
  await expect(
    page.locator('label:has-text("Winning score") strong')
  ).toHaveText("1");
  await expect(page.getByLabel("Team A name")).toHaveValue("Team A");
  await page.getByLabel("Team A name").fill("Fresh Team");
  await page.getByRole("button", { name: /Start New Match/i }).click();
  await expect(page.locator(".round-meta strong")).not.toHaveText(
    previousPuzzle
  );
  await expect(page.locator(".round-meta span")).toHaveText("ROUND 1");
  await expect(page.locator(".team-score-a > b")).toContainText("0");
  await expect(page.locator(".team-score-b > b")).toContainText("0");
});

test("New Showdown accepts mouse and pointer activation", async ({ page }) => {
  await configureDeterministicShuffle(page);
  await page.goto("/play?mode=classroom&skipOnboarding=1");
  await page.getByRole("button", { name: /Start New Match/i }).click();
  await page.locator(".teacher-menu summary").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "End Game" }).click();
  await page.getByRole("button", { name: "New Showdown" }).click();
  await expect(
    page.getByRole("button", { name: /Start New Match/i })
  ).toBeVisible();
});

test("New Showdown accepts touch-style activation", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 800, height: 900 },
    hasTouch: true
  });
  const page = await context.newPage();
  await configureDeterministicShuffle(page);
  await page.goto("/play?mode=classroom&skipOnboarding=1");
  await page.getByRole("button", { name: /Start New Match/i }).click();
  await page.locator(".teacher-menu summary").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "End Game" }).click();
  const button = page.getByRole("button", { name: "New Showdown" });
  const box = await button.boundingBox();
  if (!box) throw new Error("New Showdown is not visible");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole("button", { name: /Start New Match/i })
  ).toBeVisible();
  await context.close();
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 }
]) {
  test(`fits active gameplay at ${viewport.width}×${viewport.height}`, async ({
    page
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/play?mode=classroom&skipOnboarding=1");
    await page.getByRole("button", { name: /Start New Match/i }).click();
    await expect(
      page.getByRole("button", { name: /Ready Team A/i })
    ).toBeVisible();
    const metrics = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.scrollY).toBe(0);
    await expect(page.getByTestId("tracing-canvas")).toBeVisible();
  });
}
