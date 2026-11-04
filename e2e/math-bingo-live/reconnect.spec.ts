import { expect, test } from "@playwright/test";

import { PAGE_ERRORS, cardLayout, closeRoom, createGame, hostNext, joinPlayer, markBest, signInTeacher, state, useFreeSpace, waitFor } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(() => {
  expect(PAGE_ERRORS, PAGE_ERRORS.join("\n")).toEqual([]);
});

test("refresh restores the same player, card, marks, Free Space and win; host refresh and takeover; pause is server-side", async ({ browser }) => {
  test.setTimeout(600_000);
  const host = await signInTeacher(browser);
  const created = await createGame(host.page, { mode: "subtraction", level: "facts-20", questionSeconds: 0, revealSeconds: 0, winners: 2 });
  const ava = await joinPlayer(browser, created.code, "Ava");
  const zion = await joinPlayer(browser, created.code, "Zion");
  await host.page.getByRole("button", { name: "START GAME" }).click();
  await waitFor(ava.page, current => Boolean(current.me?.board), "card");
  await hostNext(host.page);
  await waitFor(ava.page, current => current.phase === "QUESTION_ACTIVE", "question");
  expect(await useFreeSpace(ava.page)).toBe("free-space");
  expect((await markBest(ava.page))?.result).toBe("correct");
  const before = await state(ava.page);

  // Player refresh: same seat, nothing duplicated.
  await ava.page.reload();
  const after = await waitFor(ava.page, current => Boolean(current.me?.board), "restored card");
  expect(after.me!.name).toBe("Ava");
  expect(cardLayout(after.me!.board!)).toBe(cardLayout(before.me!.board!));
  expect(after.me!.marks).toBe(before.me!.marks);
  expect(after.me!.freeUsed).toBe(true);
  expect(after.me!.markUsed).toBe(true);
  expect(after.questionNumber).toBe(before.questionNumber);
  await expect(ava.page.locator('[data-cell="12"]')).toHaveAttribute("aria-pressed", "true");
  expect((await state(host.page)).players?.map(player => player.name).sort()).toEqual(["Ava", "Zion"]);

  // Pause: every screen shows PAUSED; a tap during the pause is refused.
  await hostNext(host.page);
  await hostNext(host.page);
  await waitFor(zion.page, current => current.phase === "QUESTION_ACTIVE" && current.questionNumber === 2, "question 2");
  await host.page.getByRole("button", { name: "Pause" }).click();
  await waitFor(zion.page, current => current.phase === "PAUSED", "paused");
  await expect(zion.page.locator(".phase-overlay")).toContainText("PAUSED");
  await expect(host.page.locator(".stage-overlay")).toContainText("PAUSED");
  const pausedTap = await zion.page.evaluate(async () => {
    const seat = JSON.parse(sessionStorage.getItem("mathnexa:math-bingo-live:seat") ?? "{}");
    const reply = await fetch("/api/games/math-bingo-live/play", { method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin", body: JSON.stringify({ action: "mark", token: seat.token, game: 1, question: 2, cell: 0 }) });
    return (await reply.json()).result;
  });
  expect(pausedTap).toBe("paused");
  await host.page.getByRole("button", { name: "Resume" }).click();
  await waitFor(zion.page, current => current.phase === "QUESTION_ACTIVE", "resumed");

  // Play Ava to a Bingo, then refresh her: the win and placement survive.
  for (let guard = 0; guard < 160; guard += 1) {
    const current = await state(host.page);
    if (current.winnerCount >= 1) break;
    if (current.phase === "QUESTION_ACTIVE") {
      await waitFor(ava.page, live => live.questionNumber === current.questionNumber, "Ava sees the question");
      await markBest(ava.page);
      if ((await state(ava.page)).me!.hasWon) break;
    }
    await hostNext(host.page);
  }
  await waitFor(ava.page, current => current.me!.hasWon, "Ava won");
  await ava.page.reload();
  const restoredWin = await waitFor(ava.page, current => Boolean(current.me?.board), "restored after win");
  expect(restoredWin.me!.hasWon).toBe(true);
  expect(restoredWin.me!.placement).toBe(1);
  await expect(ava.page.locator(".winner-ribbon")).toContainText("You finished 1st");

  // Host refresh: same room, same code, same roster.
  await host.page.reload();
  const hostAfter = await waitFor(host.page, current => current.code === created.code && (current.players?.length ?? 0) === 2, "host restored");
  expect(hostAfter.winnerCount).toBe(1);

  // A second host window takes control; the first one is told, and can take it back.
  const second = await host.context.newPage();
  await second.goto("/games/math-bingo-live/host");
  await waitFor(second, current => current.code === created.code, "second window controls the room");
  await expect(host.page.getByText("This game is open in another window")).toBeVisible({ timeout: 15_000 });
  const tokenBefore = await host.page.evaluate(() => sessionStorage.getItem("mathnexa:math-bingo-live:host-token"));
  await host.page.getByRole("button", { name: "Take control here" }).click();
  await expect.poll(() => host.page.evaluate(() => sessionStorage.getItem("mathnexa:math-bingo-live:host-token"))).not.toBe(tokenBefore);
  await expect(host.page.locator("body")).toHaveAttribute("data-screen", "host-game");
  await expect(second.getByText("This game is open in another window")).toBeVisible({ timeout: 15_000 });
  await second.close();
  await host.page.waitForTimeout(2500);
  await expect(host.page.locator("body")).toHaveAttribute("data-screen", "host-game");

  // A student can never become the host: no session, and the room code is not authority.
  const takeover = await ava.page.evaluate(async code => {
    const seat = JSON.parse(sessionStorage.getItem("mathnexa:math-bingo-live:seat") ?? "{}");
    const attempts = [
      { action: "resume" },
      { action: "next", hostToken: seat.token, phase: "QUESTION_ACTIVE", question: 1 },
      { action: "close", hostToken: seat.token, code },
      { action: "create", settings: {} }
    ];
    const statuses = [];
    for (const body of attempts) {
      const reply = await fetch("/api/games/math-bingo-live/host", { method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin", body: JSON.stringify(body) });
      statuses.push(reply.status);
    }
    return statuses;
  }, created.code);
  expect(takeover).toEqual([401, 401, 401, 401]);
  expect((await state(host.page)).phase).not.toBe("LOBBY");

  // Removing a player: they are told, and leave the roster.
  await host.page.locator(".controls").getByRole("button", { name: /Players/ }).click();
  await host.page.getByRole("button", { name: "Remove Zion" }).click();
  await host.page.getByRole("dialog", { name: "Remove Zion?" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(zion.page.locator(".ended-title")).toHaveText("You're no longer in this game", { timeout: 15_000 });
  await expect(zion.page.locator(".ended-text")).toHaveText("Your teacher removed you from this game.");
  await waitFor(host.page, current => (current.players?.length ?? 0) === 1, "roster without Zion");

  await closeRoom(host.page);
  for (const context of [host.context, ava.context, zion.context]) await context.close();
});
