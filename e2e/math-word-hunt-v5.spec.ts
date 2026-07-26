import { expect, test } from "@playwright/test";

test("v5 stays offline, starts a lesson, and cleans up its audio session", async ({
  page
}) => {
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/math-word-hunt-v5.html");

  await expect(page).toHaveTitle(/Lessons v5/);
  await expect(page.locator(".grade-card")).toHaveCount(3);
  await page.locator('.grade-card[data-grade="6"]').click();
  await page.locator(".topic-card summary").first().click();
  await page.locator(".choose-topic-button").first().click();
  await page.locator(".lesson-row").first().click();

  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator("#soundButton")).toContainText("Full");
  await expect(page.locator("#musicButton")).toContainText("Low");

  const controlsFit = await page.locator(".teacher-bar").evaluate((bar) => ({
    fits: bar.scrollWidth <= bar.clientWidth,
    shortControls: [...bar.querySelectorAll("button")].filter(
      (button) => button.getBoundingClientRect().height < 44
    ).length
  }));
  expect(controlsFit).toEqual({ fits: true, shortControls: 0 });

  await expect
    .poll(() =>
      page.evaluate(() => window.__MATH_WORD_HUNT__.getAudioState().musicRunning)
    )
    .toBe(true);

  await page.locator("#soundButton").click();
  await expect(page.locator("#soundButton")).toContainText("Tones");
  await page.locator("#soundButton").click();
  await expect(page.locator("#soundButton")).toContainText("Muted");
  await expect
    .poll(() =>
      page.evaluate(() => window.__MATH_WORD_HUNT__.getAudioState().musicRunning)
    )
    .toBe(false);

  await page.locator("#soundButton").click();
  await expect(page.locator("#soundButton")).toContainText("Full");
  await page.locator("#backLessonsButton").click();
  await expect(page.locator("#lessonScreen")).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__MATH_WORD_HUNT__.getAudioState().activeMusicNodes
        ),
      { timeout: 2_000 }
    )
    .toBe(0);

  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("v5 plays through correct and wrong Pointer Event paths without changing scoring rules", async ({
  page
}) => {
  await page.goto("/math-word-hunt-v5.html");
  await page.locator('.grade-card[data-grade="6"]').click();
  await page.locator(".topic-card summary").first().click();
  await page.locator(".choose-topic-button").first().click();
  await page.locator(".lesson-row").first().click();

  const first = await page.evaluate(() => {
    const game = window.__MATH_WORD_HUNT__.getState();
    return {
      key: game.placements[0].key,
      start: game.placements[0].cells[0],
      end: game.placements[0].cells.at(-1)
    };
  });
  await page.locator(`.word-card[data-term-key="${first.key}"]`).click();

  const start = page.locator(
    `.grid-cell[data-row="${first.start.row}"][data-col="${first.start.col}"]`
  );
  const end = page.locator(
    `.grid-cell[data-row="${first.end.row}"][data-col="${first.end.col}"]`
  );
  await start.click();
  await end.click();

  await expect(page.locator("#findLayer")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => window.__MATH_WORD_HUNT__.getState().found.includes(key),
        first.key
      )
    )
    .toBe(true);
  await page.locator("#gotItButton").click();

  const beforeWrong = await page.evaluate(
    () => window.__MATH_WORD_HUNT__.getState().found.length
  );
  const nextKey = await page.evaluate(() => {
    const game = window.__MATH_WORD_HUNT__.getState();
    return game.entries.find(
      (entry) => !game.found.includes(entry.key) && entry.grid.length > 2
    )?.key;
  });
  expect(nextKey).toBeTruthy();
  await page.locator(`.word-card[data-term-key="${nextKey}"]`).click();
  const wrongStart = page.locator('.grid-cell[data-row="0"][data-col="0"]');
  const wrongEnd = page.locator('.grid-cell[data-row="0"][data-col="1"]');
  await wrongStart.click();
  await wrongEnd.click();

  await expect(page.locator("#toast")).toContainText("does not match");
  expect(
    await page.evaluate(() => window.__MATH_WORD_HUNT__.getState().found.length)
  ).toBe(beforeWrong);
});

declare global {
  interface Window {
    __MATH_WORD_HUNT__: {
      getState(): {
        entries: Array<{ key: string; grid: string }>;
        placements: Array<{
          key: string;
          cells: Array<{ row: number; col: number }>;
        }>;
        found: string[];
      };
      getAudioState(): {
        musicRunning: boolean;
        activeMusicNodes: number;
      };
    };
  }
}
