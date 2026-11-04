import { expect, test } from "@playwright/test";

import { PAGE_ERRORS, closeRoom, createGame, hostNext, joinPlayer, markBest, signInTeacher, solve, state, waitFor, startGame } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(() => {
  expect(PAGE_ERRORS, PAGE_ERRORS.join("\n")).toEqual([]);
});

const MODEL_LABEL = /^Row \d, column [BINGO]: Fraction model: (\d+) of (\d+) equal parts shaded\./;

test("Fraction Bingo: symbolic question, visual models, exact match, reveal with model, Called Fractions history", async ({ browser }) => {
  test.setTimeout(600_000);
  const host = await signInTeacher(browser);
  const created = await createGame(host.page, { mode: "fractions", level: "to-eighths", questionSeconds: 0, revealSeconds: 0, winners: 1 });
  expect(created.settings.mode).toBe("fractions");
  expect(created.settings.equivalentFractions).toBe(false);
  const ava = await joinPlayer(browser, created.code, "Ava");
  const zion = await joinPlayer(browser, created.code, "Zion");
  await expect(ava.page.getByText("Find the model with that many equal parts shaded.")).toBeVisible();
  await startGame(host.page);

  const card = await waitFor(ava.page, current => Boolean(current.me?.board), "card");
  // Every normal cell is an original SVG model with an exact description.
  const cells = ava.page.locator(".card-cell:not(.is-free)");
  await expect(cells).toHaveCount(24);
  for (let index = 0; index < 24; index += 1) {
    const cell = cells.nth(index);
    const label = await cell.getAttribute("aria-label");
    const match = MODEL_LABEL.exec(label ?? "");
    expect(match, label ?? "").not.toBeNull();
    const [n, d] = [Number(match![1]), Number(match![2])];
    await expect(cell.locator("svg.fraction-model .part")).toHaveCount(d);
    await expect(cell.locator("svg.fraction-model .part.shaded")).toHaveCount(n);
  }
  // Different players can see the same value drawn as different shapes.
  const zionCard = await waitFor(zion.page, current => Boolean(current.me?.board), "card");
  const shapes = new Set([...card.me!.board!, ...zionCard.me!.board!].filter(cell => !cell.free).map(cell => cell.shape));
  expect(shapes.size).toBeGreaterThanOrEqual(3);

  let exactRefusalChecked = false;
  const calledSoFar: string[] = [];
  for (let guard = 0; guard < 160; guard += 1) {
    const current = await state(host.page);
    if (current.phase === "WINNER_REVEAL" || current.phase === "GAME_COMPLETE") break;
    if (current.phase === "QUESTION_ACTIVE") {
      const question = current.question!;
      expect(question.text).toMatch(/^[1-7]\/[2-8]$/);
      // The symbolic fraction, never a picture, is the question.
      await expect(host.page.locator(".stage .question-face.is-fraction")).toHaveAttribute("aria-label", new RegExp(`\\(${question.text}\\)$`));
      const seen = await waitFor(ava.page, live => live.questionNumber === current.questionNumber, "Ava sees the question");
      // Exact match: an equal-value model written differently is refused.
      if (!exactRefusalChecked) {
        const answer = solve(question);
        const index = seen.me!.board!.findIndex((cell, cellIndex) => !cell.free && ((seen.me!.marks >>> cellIndex) & 1) === 0
          && cell.n * answer.d === answer.n * cell.d && !(cell.n === answer.n && cell.d === answer.d));
        if (index >= 0) {
          const reply = ava.page.waitForResponse(response => response.url().endsWith("/api/games/math-bingo-live/play") && (response.request().postData() ?? "").includes("\"mark\""));
          await ava.page.locator(`[data-cell="${index}"]`).click();
          expect((await (await reply).json()).result).toBe("incorrect");
          await expect(ava.page.locator(".toast")).toContainText(`That square shows ${seen.me!.board![index].n}/${seen.me!.board![index].d}`);
          exactRefusalChecked = true;
        }
      }
      await markBest(ava.page);
      await waitFor(zion.page, live => live.questionNumber === current.questionNumber, "Zion sees the question");
      if (guard % 3 === 0) await markBest(zion.page);
      calledSoFar.push(question.text);
    }
    const advanced = await hostNext(host.page);
    if (advanced.phase === "ANSWER_REVEAL") {
      // Reveal: the fraction, an enlarged correct model, and the words.
      const reveal = advanced.question!.reveal!;
      await expect(host.page.locator(".stage .reveal-model")).toBeVisible();
      await expect(host.page.locator(".stage .reveal-caption")).toHaveText(reveal.description!);
      expect(reveal.description).toBe(`${reveal.answer.n} of ${reveal.answer.d} equal parts shaded`);
      // History keeps every called fraction, current highlighted; nothing future.
      const live = await waitFor(ava.page, player => player.questionNumber === advanced.questionNumber && player.phase === "ANSWER_REVEAL", "Ava reveal");
      expect(live.called.map(item => item.text)).toEqual(calledSoFar);
      await ava.page.locator(".called-toggle").click();
      await expect(ava.page.locator(".called-toggle")).toContainText(`Called Fractions (${calledSoFar.length})`);
      await expect(ava.page.locator(".called-item")).toHaveCount(calledSoFar.length);
      await expect(ava.page.locator(".called-item.is-current .called-text")).toHaveText(calledSoFar[calledSoFar.length - 1]);
      await ava.page.locator(".called-toggle").click();
      await expect(host.page.locator(".side-called .called-item")).toHaveCount(calledSoFar.length);
    }
  }
  expect(exactRefusalChecked, "an equal-value model in a different form was refused under exact match").toBe(true);
  const done = await waitFor(host.page, current => current.phase === "WINNER_REVEAL" || current.phase === "GAME_COMPLETE", "fraction winner", 15_000);
  expect(done.winners).toHaveLength(1);
  await closeRoom(host.page);
  for (const context of [host.context, ava.context, zion.context]) await context.close();
});

test("Equivalent Fractions (host setting): any equal-value model counts, by rational arithmetic", async ({ browser }) => {
  test.setTimeout(420_000);
  const host = await signInTeacher(browser);
  const created = await createGame(host.page, { mode: "fractions", level: "to-eighths", questionSeconds: 0, revealSeconds: 0, winners: 1, equivalentFractions: true });
  expect(created.settings.equivalentFractions).toBe(true);
  const ava = await joinPlayer(browser, created.code, "Ava");
  await startGame(host.page);
  await waitFor(ava.page, current => Boolean(current.me?.board), "card");
  let acceptedEquivalent = false;
  for (let guard = 0; guard < 140 && !acceptedEquivalent; guard += 1) {
    const current = await state(host.page);
    if (current.phase === "WINNER_REVEAL" || current.phase === "GAME_COMPLETE") break;
    if (current.phase === "QUESTION_ACTIVE") {
      const seen = await waitFor(ava.page, live => live.questionNumber === current.questionNumber, "Ava sees the question");
      const answer = solve(current.question!);
      const index = seen.me!.board!.findIndex((cell, cellIndex) => !cell.free && ((seen.me!.marks >>> cellIndex) & 1) === 0
        && cell.n * answer.d === answer.n * cell.d && !(cell.n === answer.n && cell.d === answer.d));
      if (index >= 0) {
        const reply = ava.page.waitForResponse(response => response.url().endsWith("/api/games/math-bingo-live/play") && (response.request().postData() ?? "").includes("\"mark\""));
        await ava.page.locator(`[data-cell="${index}"]`).click();
        expect((await (await reply).json()).result).toBe("correct");
        acceptedEquivalent = true;
      } else {
        await markBest(ava.page);
      }
    }
    await hostNext(host.page);
  }
  expect(acceptedEquivalent).toBe(true);
  await closeRoom(host.page);
  await host.context.close();
  await ava.context.close();
});
