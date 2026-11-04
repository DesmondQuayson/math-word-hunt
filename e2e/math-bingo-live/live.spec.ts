import { expect, test, type Page } from "@playwright/test";

import {
  PAGE_ERRORS,
  cardLayout,
  cardSignature,
  closeRoom,
  createGame,
  hostNext,
  joinPlayer,
  markBest,
  markWrong,
  signInTeacher,
  startGame,
  state,
  useFreeSpace,
  waitFor,
  type LiveState
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(() => {
  expect(PAGE_ERRORS, PAGE_ERRORS.join("\n")).toEqual([]);
});

/**
 * The owner's scenario: a free teacher hosts, Ava, Zion and Omar join with a
 * code and a name, Omar uses his Free Space, Ava gets FIRST BINGO, keeps
 * playing as a spectator but can never win again, Zion and Omar finish
 * second and third, and with three winners configured the game ends at once.
 */
test("host + Ava, Zion, Omar: fair cards, live marks, Free Space, three Bingos, game complete, rematch", async ({ browser }) => {
  test.setTimeout(900_000);
  const host = await signInTeacher(browser);
  const created = await createGame(host.page, { mode: "addition", level: "facts-20", questionSeconds: 0, revealSeconds: 0, winners: 3 });
  const code = created.code;
  await expect(host.page.locator(".join-url")).toHaveText(/\/join$/);
  await expect(host.page.locator(".join-code .code-display")).toHaveAttribute("aria-label", `Code ${code.split("").join(" ")}`);

  const ava = await joinPlayer(browser, code, "Ava");
  const zion = await joinPlayer(browser, code, "Zion");
  const omar = await joinPlayer(browser, code, "Omar");
  const players: Record<string, Page> = { Ava: ava.page, Zion: zion.page, Omar: omar.page };

  // Names appear live in the host lobby.
  for (const name of ["Ava", "Zion", "Omar"]) await expect(host.page.locator(".roster")).toContainText(name);
  await expect(host.page.locator(".roster-title")).toHaveText("PLAYERS — 3");
  await expect(ava.page.locator(".youre-in-name")).toHaveText("Ava");
  await expect(ava.page.getByText("Waiting for your teacher to start.")).toBeVisible();

  await startGame(host.page);

  // Same answer multiset for everyone; a different arrangement for each.
  const boards = await Promise.all(Object.values(players).map(page => waitFor(page, current => Boolean(current.me?.board), "card dealt")));
  const signatures = new Set(boards.map(current => cardSignature(current.me!.board!)));
  const layouts = new Set(boards.map(current => cardLayout(current.me!.board!)));
  expect(signatures.size).toBe(1);
  expect(layouts.size).toBe(3);
  for (const current of boards) {
    expect(current.me!.board).toHaveLength(25);
    expect(current.me!.board![12]).toEqual({ free: true });
  }
  await expect(ava.page.locator(".card-cell")).toHaveCount(25);

  const first = await waitFor(host.page, current => current.phase === "QUESTION_ACTIVE", "question 1");
  // Every participant sees the same current question.
  for (const page of Object.values(players)) {
    const seen = await waitFor(page, current => current.questionNumber === first.questionNumber && current.phase === "QUESTION_ACTIVE", "synchronized question");
    expect(seen.question!.text).toBe(first.question!.text);
    expect(seen.question!.reveal).toBeNull();
  }
  await expect(host.page.locator(".stage .question-text")).toHaveText(first.question!.text);

  // Omar spends his Free Space; every screen is told.
  expect(await useFreeSpace(omar.page)).toBe("free-space");
  for (const page of [host.page, ava.page, zion.page]) await expect(page.locator(".banner")).toContainText("OMAR USED FREE SPACE!");
  await expect(omar.page.locator('[data-cell="12"]')).toHaveAttribute("aria-pressed", "true");

  // A wrong tap is private feedback, never a mark.
  const wrong = await markWrong(zion.page);
  if (wrong) {
    expect(wrong.result).toBe("incorrect");
    await expect(zion.page.locator(".toast")).toContainText("Not quite");
    await expect(zion.page.locator(`[data-cell="${wrong.cell}"]`)).toHaveAttribute("aria-pressed", "false");
  }

  let avaWonAt = 0;
  let zionWonAt = 0;
  let sawOneAway = false;
  const order: string[] = [];
  for (let guard = 0; guard < 200; guard += 1) {
    const hostState = await state(host.page);
    if (hostState.phase === "WINNER_REVEAL" || hostState.phase === "GAME_COMPLETE") break;
    if (hostState.phase === "QUESTION_ACTIVE") {
      // Everyone plays; Zion holds his last square until Ava has Bingo, and
      // Omar holds his until Zion has, so the order is Ava, Zion, Omar.
      for (const name of ["Ava", "Zion", "Omar"]) {
        const page = players[name];
        await waitFor(page, current => current.questionNumber === hostState.questionNumber, `${name} sees the question`);
        const me = (await state(page)).me!;
        if (me.hasWon) {
          // A winner keeps watching but can never mark (or win) again.
          const attempt = await page.evaluate(async ({ game, question }) => {
            const seat = JSON.parse(sessionStorage.getItem("mathnexa:math-bingo-live:seat") ?? "{}");
            const reply = await fetch("/api/games/math-bingo-live/play", { method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin", body: JSON.stringify({ action: "mark", token: seat.token, game, question, cell: 0 }) });
            return (await reply.json()).result;
          }, { game: hostState.gameNumber, question: hostState.questionNumber });
          expect(["already-won", "not-active", "stale"]).toContain(attempt);
          continue;
        }
        const hold = (name === "Zion" && avaWonAt === 0) || (name === "Omar" && zionWonAt === 0);
        const marked = await markBest(page, { hold });
        if (marked) expect(marked.result).toBe("correct");
        const now = await state(host.page);
        if (avaWonAt === 0 && now.winners.some(winner => winner.name === "Ava")) avaWonAt = now.questionNumber;
        if (zionWonAt === 0 && now.winners.some(winner => winner.name === "Zion")) zionWonAt = now.questionNumber;
        const after = (await state(page)).me!;
        if (after.hasWon && !order.includes(name)) order.push(name);
      }
      // The host screen must have caught up with every confirmed Bingo before Next.
      const after = await waitFor(host.page, current => current.winnerCount === order.length, "host sees the winners");
      if (avaWonAt === 0 && after.winners.some(winner => winner.name === "Ava")) avaWonAt = after.questionNumber;
      if (zionWonAt === 0 && after.winners.some(winner => winner.name === "Zion")) zionWonAt = after.questionNumber;
      if (!sawOneAway && (await host.page.locator(".one-away").textContent())?.includes("is one away!")) sawOneAway = true;
      if (after.phase === "WINNER_REVEAL" || after.phase === "GAME_COMPLETE") break;
    }
    await hostNext(host.page);
  }

  // Server-confirmed order: Ava first, Zion second, Omar third; each once.
  const final = await waitFor(host.page, current => current.phase === "WINNER_REVEAL" || current.phase === "GAME_COMPLETE", "final winner");
  expect(final.winners.map(winner => [winner.placement, winner.name])).toEqual([[1, "Ava"], [2, "Zion"], [3, "Omar"]]);
  expect(order).toEqual(["Ava", "Zion", "Omar"]);
  expect(final.winnerCount).toBe(3);
  expect(sawOneAway).toBe(true);
  const endedAt = final.questionNumber;

  // Bingo broadcast and the winner's own result.
  await expect(ava.page.locator(".winner-ribbon")).toHaveText(/BINGO! You finished 1st/);
  await expect(zion.page.locator(".winner-ribbon")).toHaveText(/You finished 2nd/);

  // Audio: the shared track plays on the host only (default), and the Bingo
  // fanfare is a host celebration by default.
  const hostAudio = await host.page.evaluate(() => (window as unknown as { __MATH_BINGO_LIVE__: { audio(): { source: string | null; lastEffect: { name: string } | null } } }).__MATH_BINGO_LIVE__.audio());
  expect(hostAudio.source).toBe("/media/audio/cosmic-candy-catchers.mp3");
  const avaAudio = await ava.page.evaluate(() => (window as unknown as { __MATH_BINGO_LIVE__: { audio(): { source: string | null; lastEffect: { name: string } | null } } }).__MATH_BINGO_LIVE__.audio());
  expect(avaAudio.source).toBeNull();
  expect(avaAudio.lastEffect?.name).not.toBe("bingo");
  expect((await host.page.evaluate(() => (window as unknown as { __MATH_BINGO_LIVE__: { audio(): { effects: string[] } } }).__MATH_BINGO_LIVE__.audio())).effects).toEqual(expect.arrayContaining(["bingo", "free-space"]));

  // Exactly at the configured number: complete, no further question.
  const complete = await waitFor(host.page, current => current.phase === "GAME_COMPLETE", "game complete", 15_000);
  expect(complete.questionNumber).toBe(endedAt);
  expect(complete.completedReason).toBe("winners");
  await expect(host.page.getByRole("heading", { name: "MATH BINGO COMPLETE" })).toBeVisible();
  await expect(host.page.locator(".podium")).toContainText("Ava");
  await expect(host.page.locator(".podium-place").nth(0)).toContainText("\u{1F947}");
  await expect(host.page.locator(".podium-place").nth(2)).toContainText("Omar");
  for (const page of Object.values(players)) await expect(page.locator(".complete-title")).toHaveText("MATH BINGO COMPLETE");
  // The host cannot generate another question for a finished game.
  const stale = await host.page.evaluate(async () => {
    const token = sessionStorage.getItem("mathnexa:math-bingo-live:host-token");
    const reply = await fetch("/api/games/math-bingo-live/host", { method: "POST", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" }, referrerPolicy: "same-origin", body: JSON.stringify({ action: "next", hostToken: token, phase: "GAME_COMPLETE", question: 1 }) });
    return (await reply.json()).result;
  });
  expect(stale).toBe("stale");
  expect((await state(host.page)).questionNumber).toBe(endedAt);

  // Play Again: same roster, no new code to type, new cards, everything reset.
  const oldLayouts = boards.map(current => cardLayout(current.me!.board!));
  await host.page.bringToFront();
  await host.page.getByRole("button", { name: "Play Again" }).click();
  const again = await waitFor(host.page, current => current.gameNumber === complete.gameNumber + 1 && current.phase === "COUNTDOWN", "rematch countdown");
  expect(again.winnerCount).toBe(0);
  expect(again.players?.map(player => player.name).sort()).toEqual(["Ava", "Omar", "Zion"]);
  const rematch = await Promise.all(Object.values(players).map(page => waitFor(page, current => current.gameNumber === again.gameNumber && Boolean(current.me?.board), "new card")));
  for (const [index, current] of rematch.entries()) {
    expect(cardLayout(current.me!.board!)).not.toBe(oldLayouts[index]);
    expect(current.me!.marks).toBe(0);
    expect(current.me!.freeUsed).toBe(false);
    expect(current.me!.hasWon).toBe(false);
  }
  await expect(ava.page.locator(".winner-ribbon")).toBeHidden();

  await closeRoom(host.page);
  for (const page of Object.values(players)) await expect(page.locator(".ended-title")).toHaveText("This game has ended", { timeout: 15_000 });
  for (const context of [host.context, ava.context, zion.context, omar.context]) await context.close();
});

test("winner count 1 ends at the first Bingo; disabled patterns never win; timed questions advance on the server clock", async ({ browser }) => {
  const host = await signInTeacher(browser);
  const created: LiveState = await createGame(host.page, { mode: "multiplication", level: "x0-5", questionSeconds: 5, revealSeconds: 2, winners: 1, rows: false, columns: true, diagonals: false, freeSpace: true });
  expect(created.settings.patterns).toEqual({ rows: false, columns: true, diagonals: false });
  const ava = await joinPlayer(browser, created.code, "Ava");
  await expect(ava.page.locator(".rule.is-off")).toHaveCount(2);
  await host.page.bringToFront();
  await host.page.getByRole("button", { name: "START GAME" }).click();
  await expect(ava.page.locator(".rules")).toContainText("Column");

  // Nobody presses Next: the server clock alone moves question -> reveal -> next question.
  const q1 = await waitFor(ava.page, current => current.phase === "QUESTION_ACTIVE", "timed question", 20_000);
  await waitFor(ava.page, current => current.phase === "ANSWER_REVEAL" && current.questionNumber === q1.questionNumber, "timed reveal", 15_000);
  const revealed = await state(ava.page);
  expect(revealed.question!.reveal!.text).toMatch(/^\d+ × \d+ = \d+$/);
  await expect(ava.page.locator(".reveal-text")).toHaveText(revealed.question!.reveal!.text);
  await waitFor(ava.page, current => current.phase === "QUESTION_ACTIVE" && current.questionNumber === q1.questionNumber + 1, "next timed question", 15_000);

  const until = Date.now() + 330_000;
  while (Date.now() < until) {
    const current = await state(ava.page);
    if (current.phase === "WINNER_REVEAL" || current.phase === "GAME_COMPLETE") break;
    if (current.phase === "QUESTION_ACTIVE" && !current.me!.markUsed) {
      const marked = await markBest(ava.page);
      const after = await state(ava.page);
      // A full row or diagonal is never a win when only columns count.
      if (marked?.result === "correct" && !after.me!.hasWon) {
        expect(after.winnerCount).toBe(0);
      }
    }
    await ava.page.waitForTimeout(400);
  }
  const done = await waitFor(ava.page, current => current.phase === "WINNER_REVEAL" || current.phase === "GAME_COMPLETE", "single winner ends the game", 15_000);
  expect(done.winners).toHaveLength(1);
  expect(done.winners[0].lineType).toBe("column");
  await expect(ava.page.locator(".winner-ribbon")).toContainText("You finished 1st");
  await waitFor(ava.page, current => current.phase === "GAME_COMPLETE", "complete");
  await closeRoom(host.page);
  await host.context.close();
  await ava.context.close();
});
