import { expect, test, type Page } from "@playwright/test";

import { PAGE_ERRORS, closeRoom, front, joinPlayer, signInTeacher, startGame, state, waitFor } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(() => {
  expect(PAGE_ERRORS, PAGE_ERRORS.join("\n")).toEqual([]);
});

/** A host API call from the signed-in page (same origin), returning the HTTP status and JSON body. */
async function hostCall(page: Page, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  return page.evaluate(async payload => {
    const token = sessionStorage.getItem("mathnexa:math-bingo-live:host-token");
    const reply = await fetch("/api/games/math-bingo-live/host", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" },
      referrerPolicy: "same-origin",
      body: JSON.stringify({ ...payload, hostToken: token })
    });
    return { status: reply.status, json: await reply.json() };
  }, body);
}

/**
 * Number of winners is one box for every game type: any whole number from 1
 * to 60, typed or stepped; no presets, no cap from the level. The lobby puts
 * the target beside the players and warns (never resets) when the target is
 * more than the players. The server refuses anything that is not a whole
 * number from 1 to 60, whatever the page sends.
 */
test("winner target: any whole number, typed or stepped; lobby warning; server-side refusals; Start goes ahead", async ({ browser }) => {
  test.setTimeout(300_000);
  const host = await signInTeacher(browser);
  const page = host.page;
  await front(page);
  await expect(page.locator("body")).toHaveAttribute("data-screen", "setup");

  // One box and two buttons, for every mode: no winner chips at all.
  for (const mode of ["addition", "subtraction", "multiplication", "division", "mixed", "fractions"]) {
    await page.locator(`input[name="mode"][value="${mode}"]`).click({ force: true });
    await expect(page.locator('input[name="winners"][type="radio"]')).toHaveCount(0);
    await expect(page.locator("#winners-count")).toBeVisible();
    await expect(page.locator("#winners-count")).toHaveAttribute("min", "1");
    await expect(page.locator("#winners-count")).toHaveAttribute("max", "60");
  }
  await page.locator('input[name="mode"][value="addition"]').click({ force: true });
  await page.locator('input[name="level"][value="facts-20"]').click({ force: true });

  const box = page.locator("#winners-count");
  await box.fill("18");
  await page.getByRole("button", { name: "One more winner" }).click();
  await expect(box).toHaveValue("19");
  await page.getByRole("button", { name: "One fewer winner" }).click();
  await page.getByRole("button", { name: "One fewer winner" }).click();
  await expect(box).toHaveValue("17");
  await box.fill("60");
  await page.getByRole("button", { name: "One more winner" }).click();
  await expect(box).toHaveValue("60");
  await box.fill("1");
  await page.getByRole("button", { name: "One fewer winner" }).click();
  await expect(box).toHaveValue("1");

  // Typed values that are not a whole number from 1 to 60 stay on the form with a message.
  for (const typed of ["0", "61", "-3"]) {
    await box.fill(typed);
    await page.getByRole("button", { name: "CREATE GAME" }).click();
    await expect(page.locator(".setup-form .form-error")).toHaveText("Choose a whole number of winners from 1 to 60.");
    await expect(page.locator("body")).toHaveAttribute("data-screen", "setup");
  }
  // Keyboard entry: a number nobody would find in a preset list.
  await box.fill("");
  await box.pressSequentially("12");
  await page.getByRole("button", { name: "CREATE GAME" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "lobby");
  const created = await waitFor(page, current => /^[1-9]\d{5}$/.test(current.code), "room code");
  expect(created.settings.winners).toBe(12);
  await expect(page.locator(".lobby-target")).toHaveText("Players: 0 · Winner target: 12");
  await expect(page.locator(".lobby-warning")).toBeHidden();

  // Two players: the target is more than the players — a warning, nothing reset.
  const ava = await joinPlayer(browser, created.code, "Ava");
  const zion = await joinPlayer(browser, created.code, "Zion");
  await expect(page.locator(".lobby-target")).toHaveText("Players: 2 · Winner target: 12");
  await expect(page.locator(".lobby-warning")).toContainText("Winner target exceeds current players. Add more players or reduce the target before starting.");
  expect((await state(page)).settings.winners).toBe(12);

  // The server refuses targets that are not whole numbers from 1 to 60, whatever the page sends.
  const base = (await state(page)).settings;
  for (const winners of [0, -1, 1.5, 61, "5", null, 1e9]) {
    const refused = await hostCall(page, { action: "settings", settings: { ...base, winners } });
    expect(refused.status, String(winners)).toBe(400);
    expect(refused.json.error, String(winners)).toBe("invalid-winners");
  }
  expect((await state(page)).settings.winners).toBe(12);
  // A valid change is kept exactly; the warning follows the numbers.
  const changed = await hostCall(page, { action: "settings", settings: { ...base, winners: 2 } });
  expect(changed.status).toBe(200);
  await waitFor(page, current => current.settings.winners === 2, "target 2");
  await expect(page.locator(".lobby-target")).toHaveText("Players: 2 · Winner target: 2");
  await expect(page.locator(".lobby-warning")).toBeHidden();
  await hostCall(page, { action: "settings", settings: { ...base, winners: 12 } });
  await waitFor(page, current => current.settings.winners === 12, "target 12 again");

  // Start is not refused: with 12 wanted and 2 players, the game ends when both have Bingo.
  const started = await startGame(page);
  expect(started.phase).toBe("QUESTION_ACTIVE");
  await expect(page.locator(".head-winners")).toHaveText("Winners 0 / 12");
  await expect(page.locator(".head-pacing")).toHaveCount(0);
  await expect(ava.page.locator(".pacing-line")).toHaveCount(0);

  await closeRoom(page);
  for (const context of [ava.context, zion.context, host.context]) await context.close();
});
