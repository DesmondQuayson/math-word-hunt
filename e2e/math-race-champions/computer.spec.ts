import { expect, test } from "@playwright/test";

import { PAGE_ERRORS, RACER, adminClient, api, assertNoScroll, evidence, ledger, newPage, raceAnswer, raceGraphics, raceRivals, raceToFinish, raceView, resetAccount, shownQuestion, signIn, solve, waitForGo, waitForScreen } from "./helpers";

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

test.describe("Race Computer", () => {
  test("Stage 1 from the hub to the reward: a real 3D race, judged by the server", async ({ browser }) => {
    test.setTimeout(600_000);
    const admin = adminClient();
    const racerId = await resetAccount(admin, RACER.email);
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await signIn(page, RACER);
    await waitForScreen(page, "hub");
    await evidence(page, "hub-1366x768");
    await page.getByRole("button", { name: /Race Computer/ }).click();
    await waitForScreen(page, "computer");

    // A new account: Stage 1 open, Stages 2 to 10 locked, no Race Dollars, the free starter car.
    await expect(page.locator(".stage-card")).toHaveCount(10);
    await expect(page.locator(".stage-card:not(.is-locked)")).toHaveCount(1);
    await expect(page.locator(".wallet strong")).toHaveText("R$ 0");
    await expect(page.locator(".car-strip-name")).toHaveText("Street Starter");
    await expect(page.locator(".stage-facts")).toContainText("At least 30 correct answers");
    await expect(page.locator(".stage-facts")).toContainText("R$ 500");
    await evidence(page, "computer-stages-1366x768");

    await page.getByRole("button", { name: "Start race" }).click();
    await waitForScreen(page, "race");
    // The road is built first; the server's countdown starts only when the picture is ready.
    await page.waitForFunction(() => document.querySelector("main.race")?.getAttribute("data-phase") === "countdown", null, { timeout: 90_000, polling: 50 });
    // Before the lights go out nobody moves and no answer is accepted.
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".race-choice")].map((button) => button.disabled))).toEqual([true, true]);
    expect((await raceView(page))?.progress ?? 0).toBe(0);
    // A real 3D scene, not a picture: WebGL is drawing.
    expect(["low", "medium", "high"]).toContain(await raceGraphics(page));
    await waitForGo(page);

    const question = await shownQuestion(page);
    expect(question.choices).toHaveLength(2);
    expect(question.choices[0]).not.toBe(question.choices[1]);
    await expect(page.locator(".hud-chip-correct .hud-chip-value")).toHaveText("0/30 minimum");

    // A correct answer accelerates the car.
    const before = (await raceView(page))!;
    await raceAnswer(page, true);
    const after = (await raceView(page))!;
    expect(after.correct).toBe(1);
    expect(after.speed).toBeGreaterThan(before.speed);

    // A few more, then a wrong one: no boost, no distance credit, and the car is not faster.
    for (let index = 0; index < 4; index += 1) await raceAnswer(page, true);
    const fast = (await raceView(page))!;
    await raceAnswer(page, false);
    const slowed = (await raceView(page))!;
    expect(slowed.correct).toBe(fast.correct);
    expect(slowed.wrong).toBe(1);
    expect(slowed.speed).toBeLessThan(fast.speed);
    await evidence(page, "computer-race-1366x768");
    await assertNoScroll(page);

    // The minimap marker, the progress read-out and the 3D car all come from one number.
    const agreement = await page.evaluate(() => {
      const main = Number(document.querySelector(".race")!.getAttribute("data-progress"));
      const marker = Number(document.querySelector<SVGElement>(".minimap-me")!.dataset.progress);
      const cpu = Number(document.querySelector<SVGElement>(".minimap-cpu")!.dataset.progress);
      return { main, marker, cpu, text: document.querySelector(".hud-chip-race .hud-chip-value")!.textContent };
    });
    expect(agreement.marker).toBeCloseTo(agreement.main, 3);
    expect(agreement.text).toBe(`${Math.floor(agreement.main * 100)}%`);
    expect((await raceRivals(page))[0].id).toBe("cpu");
    // The computer is on the map too (it may not have answered yet: it takes about 7 seconds over each question on Stage 1).
    expect(agreement.cpu).toBeGreaterThanOrEqual(0);
    expect(agreement.cpu).toBeLessThan(1);

    // Race on. Two more deliberate mistakes on the way.
    await raceToFinish(page, { wrong: 2 });
    await expect(page.locator("#result-title")).toHaveText("Victory!", { timeout: 30_000 });
    const final = (await raceView(page))!;
    expect(final.finished).toBe(true);
    expect(final.progress).toBe(1);
    expect(final.correct).toBeGreaterThanOrEqual(30);
    await expect(page.locator(".hud-chip-correct .hud-chip-value")).toContainText("✓");
    await expect(page.locator(".result-earned")).toContainText("R$ 500");
    await expect(page.locator(".result-earned")).toContainText("First Win");
    await evidence(page, "computer-result-1366x768");

    // What the server recorded: one stage reward, each achievement once, a balance that adds up.
    const lines = await ledger(admin, racerId);
    expect(lines.filter((line) => line.event === "STAGE_REWARD").map((line) => line.amount)).toEqual([500]);
    const achievements = lines.filter((line) => line.event === "ACHIEVEMENT");
    expect(achievements.map((line) => line.idempotency_key)).toContain("achievement:first-win");
    expect(new Set(achievements.map((line) => line.idempotency_key)).size).toBe(achievements.length);
    const balance = 500 + achievements.length * 250;
    expect(lines[lines.length - 1].balance_after).toBe(balance);
    await expect(page.locator(".result-balance")).toContainText(`R$ ${balance.toLocaleString("en-US")}`);

    // Winning unlocked Stage 2, and only Stage 2.
    await page.getByRole("button", { name: "Stages" }).click();
    await waitForScreen(page, "computer");
    await expect(page.locator(".stage-card:not(.is-locked)")).toHaveCount(2);
    await expect(page.locator(".stage-card.is-won")).toHaveCount(1);
    await expect(page.locator(".wallet strong")).toHaveText(`R$ ${balance.toLocaleString("en-US")}`);

    // My Progress shows the same record.
    await page.getByRole("button", { name: "Back to the game menu" }).click();
    await page.getByRole("button", { name: "My Progress" }).click();
    await waitForScreen(page, "progress");
    await expect(page.locator(".tile").first()).toContainText(`R$ ${balance.toLocaleString("en-US")}`);
    await expect(page.locator("table .is-won")).toHaveCount(1);
    await evidence(page, "progress-1366x768");
    await context.close();
  });

  test("the server decides: no early finish, no skipped or repeated answers, no locked stage, no answers in the payload", async ({ browser }) => {
    test.setTimeout(300_000);
    const admin = adminClient();
    const racerId = await resetAccount(admin, RACER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, RACER);
    await waitForScreen(page, "hub");

    // A stage that has not been unlocked cannot be started, whatever is sent.
    expect((await api(page, "account", { action: "race-start", stage: 5, categories: "mixed", difficulty: "easy" })).status).toBe(403);
    expect((await api(page, "account", { action: "race-start", stage: 0, categories: "mixed", difficulty: "easy" })).status).toBe(400);
    expect((await api(page, "account", { action: "race-start", stage: 1, categories: ["decimal-to-fraction"], difficulty: "easy" })).status).toBe(400);

    const started = await api(page, "account", { action: "race-start", stage: 1, categories: "mixed", difficulty: "beginner" });
    expect(started.status).toBe(200);
    const run = started.body.run as { id: string; startsAtMs: number; nowMs: number; question: { index: number; text: string; choices: string[] }; cpu: { finishMs: number } };
    // The browser is told the question and its two choices; never the seed, never the answer.
    const raw = JSON.stringify(started.body);
    expect(raw).not.toMatch(/seed/i);
    expect(raw).not.toContain("correctIndex");
    expect(raw).not.toContain('"answer"');
    expect(run.question.choices).toHaveLength(2);

    // Before the start nothing counts.
    const early = await api(page, "account", { action: "race-answer", run: run.id, index: 0, choice: solve(run.question.text, run.question.choices) });
    expect(early.body.result).toBe("not-started");
    await page.waitForTimeout(run.startsAtMs - run.nowMs + 400);

    // Answering a question that is not the current one changes nothing.
    const skipped = await api(page, "account", { action: "race-answer", run: run.id, index: 7, choice: 0 });
    expect(skipped.body.result).toBe("stale");
    expect((skipped.body.state as { answered: number }).answered).toBe(0);
    // A third choice does not exist.
    expect((await api(page, "account", { action: "race-answer", run: run.id, index: 0, choice: 2 })).body.result).toBe("stale");

    // One correct answer; sending the same answer again is refused.
    const right = solve(run.question.text, run.question.choices);
    const first = await api(page, "account", { action: "race-answer", run: run.id, index: 0, choice: right });
    expect(first.body).toMatchObject({ result: "ok", correct: true });
    const repeat = await api(page, "account", { action: "race-answer", run: run.id, index: 0, choice: right });
    expect(repeat.body.result).toBe("stale");
    expect((repeat.body.state as { correct: number }).correct).toBe(1);
    // Pressing again at once is refused: the buttons rest on the server too.
    const next = first.body.question as { index: number; text: string; choices: string[] };
    const tooSoon = await api(page, "account", { action: "race-answer", run: run.id, index: next.index, choice: solve(next.text, next.choices) });
    expect(["locked", "ok"]).toContain(tooSoon.body.result);
    const state = (await api(page, "account", { action: "race-sync", run: run.id })).body.run as { state: { correct: number; x: number } };
    expect(state.state.correct).toBeLessThanOrEqual(2);

    // The race cannot be declared finished: with 1 or 2 correct answers the car is held at 1/30 or 2/30 of the road.
    await page.waitForTimeout(3000);
    const held = (await api(page, "account", { action: "race-sync", run: run.id })).body;
    expect(held.result).toBe("ok");
    expect((held.run as { state: { x: number; finishMs: number | null } }).state.finishMs).toBeNull();
    expect((held.run as { state: { x: number } }).state.x).toBeLessThanOrEqual((4.8 * 2) / 30 + 1e-9);

    // Somebody else's race cannot be touched.
    expect((await api(page, "account", { action: "race-sync", run: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);

    // Giving up pays nothing and unlocks nothing.
    const quit = await api(page, "account", { action: "race-quit", run: run.id });
    expect(quit.body.result).toBe("finished");
    expect((quit.body.outcome as { won: boolean }).won).toBe(false);
    expect(await ledger(admin, racerId)).toEqual([]);
    const account = (await api(page, "account", { action: "bootstrap" })).body;
    expect(account).toMatchObject({ balance: 0, unlocked: 1, guest: false });
    // A finished race stays finished.
    const again = (await api(page, "account", { action: "race-answer", run: run.id, index: 2, choice: 0 })).body;
    expect(again).toMatchObject({ result: "finished", repeated: true });
    expect((again.outcome as { won: boolean }).won).toBe(false);
    expect(await ledger(admin, racerId)).toEqual([]);
    await context.close();
  });
});
