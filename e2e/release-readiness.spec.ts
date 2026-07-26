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

async function deterministicFreshStart(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0.999999;
  });
}

async function completeHouseByNodes(page: Page) {
  const canvas = page.getByTestId("tracing-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Tracing canvas is not visible");
  const scale = Number(await canvas.getAttribute("data-transform-scale"));
  const offsetX = Number(await canvas.getAttribute("data-transform-offset-x"));
  const offsetY = Number(await canvas.getAttribute("data-transform-offset-y"));
  for (const [x, y] of housePath) {
    await page.mouse.click(
      box.x + offsetX + x * scale,
      box.y + offsetY + y * scale
    );
  }
}

async function solveFirstTeamAndFailSecond(page: Page) {
  await page.getByRole("button", { name: /Ready .*$/ }).click();
  await page.getByRole("button", { name: "START TURN" }).click();
  await page.getByRole("button", { name: /Node Mode/i }).click();
  await completeHouseByNodes(page);
  await page.getByRole("button", { name: /Pass to /i }).click();
  await page.getByRole("button", { name: / Is Ready/i }).click();
  await page.getByRole("button", { name: "START TURN" }).click();
  const canvas = page.getByTestId("tracing-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Tracing canvas is not visible");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: "End Turn" }).click();
  await page.getByRole("button", { name: "See Final Winner" }).click();
}

test("public landing, privacy page, and first-run onboarding are usable", async ({
  page
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Turn one continuous line into a whole-class showdown/i
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick Play" })).toBeVisible();
  await expect(
    page.getByText("No student accounts", { exact: true })
  ).toBeVisible();
  await page.getByRole("link", { name: /privacy summary/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Classroom play without student surveillance/i
    })
  ).toBeVisible();

  await page.goto("/play?mode=quick");
  await expect(page.getByText("20-second practice")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to the game" })
  ).toBeDisabled();
  await page.getByRole("button", { name: "Skip practice" }).click();
  await expect(
    page.getByRole("button", { name: /Ready Team A/i })
  ).toBeVisible();
});

test("free entitlement exposes the free path and blocks tournament routing", async ({
  page
}) => {
  await page.goto("/?tier=free");
  await expect(page.getByText("Current build: Free")).toBeVisible();
  await expect(page.getByText(/The free game keeps 15 puzzles/i)).toBeVisible();
  await page.goto("/play?mode=tournament&tier=free&skipOnboarding=1");
  await expect(
    page.getByRole("button", { name: /Ready Team A/i })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Classroom Tournament" })
  ).not.toBeVisible();
});

test("corrupt local state is discarded without breaking startup", async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("trace-clash-settings-v1", "{not-json");
    localStorage.setItem(
      "trace-clash-match-v1",
      JSON.stringify({ round: -400, puzzleOrder: ["unknown"] })
    );
    localStorage.setItem(
      "trace-clash-progress-v1",
      JSON.stringify({ puzzlesCompleted: "many", selectedTheme: "hacked" })
    );
  });
  await page.goto("/play?mode=classroom&skipOnboarding=1");
  await expect(page.getByLabel("Team A name")).toHaveValue("Team A");
  await expect(
    page.getByRole("button", { name: /Start New Match/i })
  ).toBeVisible();
});

test("two-team tournament completes a match and records standings", async ({
  page
}) => {
  await deterministicFreshStart(page);
  await page.goto("/play?mode=tournament&skipOnboarding=1");
  await page.getByLabel("Number of teams").selectOption("2");
  await page.getByLabel("Team 1").fill("North");
  await page.getByLabel("Team 2").fill("South");
  await page.getByRole("button", { name: "Start Tournament" }).click();
  await expect(page.getByText(/North goes first/i)).toBeAttached();
  await solveFirstTeamAndFailSecond(page);
  await page
    .getByRole("button", { name: "Update Tournament Standings" })
    .click();
  await expect(page.getByText("Final standings")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "North wins!" })
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "1 North" })).toBeVisible();
});

test("five consecutive full matches reset cleanly", async ({ page }) => {
  await deterministicFreshStart(page);
  for (let match = 0; match < 5; match += 1) {
    await page.goto("/play?mode=classroom&skipOnboarding=1");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('label:has-text("Winning score") input').fill("1");
    await page.getByRole("button", { name: "Easy" }).click();
    await page.getByRole("button", { name: /Start New Match/i }).click();
    await expect(page.locator(".round-meta strong")).toHaveText("Little House");
    await solveFirstTeamAndFailSecond(page);
    await expect(
      page.getByRole("heading", { name: "Team A wins!" })
    ).toBeVisible();
  }
});

test("interactive controls meet the 44px classroom target", async ({
  page
}) => {
  await page.goto("/play?mode=classroom&skipOnboarding=1");
  const undersized = await page
    .locator("button:visible")
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            label:
              button.getAttribute("aria-label") || button.textContent?.trim(),
            width: rect.width,
            height: rect.height
          };
        })
        .filter((control) => control.width < 44 || control.height < 44)
    );
  expect(undersized).toEqual([]);
});
