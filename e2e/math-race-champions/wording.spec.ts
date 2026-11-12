import { expect, test, type Page } from "@playwright/test";

import { parseConversion } from "../../apps/platform-web/public/internal-games/math-race-champions/src/engine/questions.js";
import { HttpRacer } from "../../scripts/math-race-champions-racer.mjs";
import { BASE_URL, CREATOR, HTTP_RACER_HEADERS, OWNER, PAGE_ERRORS, answer, assertNoHorizontalScroll, evidence, newPage, openClassroom, raceAnswer, raceView, shownQuestion, signIn, solve, teamState, waitForGo, waitForScreen, type Team } from "./helpers";

// Owner, 2026-11-12: a conversion is asked in words, one fixed sentence each way.
const TO_PERCENT = /^Convert \d+(\.\d+)? to a percent\.$/;
const TO_DECIMAL = /^Convert \d+(\.\d+)?% to a decimal\.$/;
const SENTENCE = /^Convert \d+(\.\d+)?%? to a (percent|decimal)\.$/;

/** Only the two conversion skills, so every question on the screen is one of the two sentences. */
const CONVERSIONS_ONLY = (difficulty: string) => {
  try {
    localStorage.setItem("mathnexa:math-race-champions:last-settings", JSON.stringify({ categories: ["percent-to-decimal", "decimal-to-percent"], difficulty }));
    const preferences = JSON.parse(localStorage.getItem("mathnexa:math-race-champions:preferences") ?? "{}");
    localStorage.setItem("mathnexa:math-race-champions:preferences", JSON.stringify({ ...preferences, graphics: "low" }));
  } catch {
    /* storage refused */
  }
};

function expectWording(text: string, choices: readonly string[]): void {
  expect(text).toMatch(SENTENCE);
  expect(text).not.toContain("=");
  expect(text).not.toContain("?");
  expect(choices).toHaveLength(2);
  expect(choices[0]).not.toBe(choices[1]);
  const conversion = parseConversion(text)!;
  expect(conversion).not.toBeNull();
  // A percentage is answered with a decimal, a decimal with a percentage: never a mix.
  for (const choice of choices) expect(choice).toMatch(conversion.fromPercent ? /^\d+(\.\d+)?$/ : /^\d+(\.\d+)?%$/);
  // Exactly one of the two is right (solve throws when both or neither fit).
  expect([0, 1]).toContain(solve(text, choices));
}

/** The question's text sits inside its box, and the box inside the screen. */
async function fits(page: Page, textSelector: string, boxSelector: string): Promise<void> {
  const overflow = await page.evaluate(
    ([text, box]) =>
      [...document.querySelectorAll(text)].map((node) => {
        const inner = node.getBoundingClientRect();
        const outer = node.closest(box)!.getBoundingClientRect();
        return {
          text: node.textContent,
          form: (node as HTMLElement).dataset.form,
          left: outer.left - inner.left,
          right: inner.right - outer.right,
          top: outer.top - inner.top,
          bottom: inner.bottom - outer.bottom,
          lines: Math.round(inner.height / parseFloat(getComputedStyle(node).lineHeight)),
          fontPx: parseFloat(getComputedStyle(node).fontSize),
          offScreen: inner.right > window.innerWidth + 1 || inner.left < -1
        };
      }),
    [textSelector, boxSelector] as const
  );
  expect(overflow.length).toBeGreaterThan(0);
  for (const item of overflow) {
    expect(item.form, item.text ?? "").toBe("sentence");
    expect(Math.max(item.left, item.right, item.top, item.bottom), `${item.text} overflows its box`).toBeLessThanOrEqual(1);
    expect(item.offScreen, item.text ?? "").toBe(false);
    // Readable: never more than two lines, never smaller than 14 px.
    expect(item.lines, item.text ?? "").toBeLessThanOrEqual(2);
    expect(item.fontPx, item.text ?? "").toBeGreaterThanOrEqual(14);
  }
}

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

test.describe("conversion questions are asked in words", () => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 }
  ]) {
    test(`Classroom Competition at ${viewport.width}x${viewport.height}: both teams see "Convert ... to a percent/decimal."`, async ({ browser }) => {
      const { context, page } = await newPage(browser, { viewport });
      await context.addInitScript(CONVERSIONS_ONLY, "medium");
      await signIn(page, OWNER);
      await openClassroom(page);
      const seen = new Set<string>();
      for (let round = 0; round < 8; round += 1) {
        for (const team of ["turquoise", "pink"] as Team[]) {
          const state = await teamState(page, team);
          const choices = await page.locator(`.cr-choice[data-team="${team}"] .cr-choice-label`).allTextContents();
          const shown = await page.locator(`#cr-question-${team}`).textContent();
          expect(shown).toBe(state.text);
          expectWording(state.text, choices);
          // What the board marks correct is what the sentence asks for.
          expect(solve(state.text, choices)).toBe(state.correctIndex);
          seen.add(TO_PERCENT.test(state.text) ? "to-percent" : TO_DECIMAL.test(state.text) ? "to-decimal" : "other");
        }
        await fits(page, ".cr-question-text", ".cr-question");
        if (round === 0) await evidence(page, `wording-classroom-${viewport.width}x${viewport.height}`);
        // Correct is +1, wrong is +0, exactly as before.
        const before = await teamState(page, "turquoise");
        await answer(page, "turquoise", round % 3 !== 2);
        const after = await teamState(page, "turquoise");
        expect(after.position).toBe(before.position + (round % 3 !== 2 ? 1 : 0));
        await answer(page, "pink", true);
      }
      expect([...seen].sort()).toEqual(["to-decimal", "to-percent"]);
      await assertNoHorizontalScroll(page);
      await context.close();
    });
  }

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 568 }
  ]) {
    test(`Computer Race at ${viewport.width}x${viewport.height}: the question is a sentence, the two answers are the conversion`, async ({ browser }) => {
      test.setTimeout(420_000);
      const { context, page } = await newPage(browser, { viewport });
      await context.addInitScript(CONVERSIONS_ONLY, "medium");
      await signIn(page, OWNER);
      await waitForScreen(page, "hub");
      // A test drive: the real race screen and question stream, in this tab.
      await page.evaluate(async () => {
        const hook = (window as unknown as { __MATH_RACE__: { context: unknown } }).__MATH_RACE__;
        const { startStage } = await import("/internal-games/math-race-champions/src/computer/start.js" as string);
        await startStage(hook.context, { stage: 1, carKey: "starter", reason: "try", settings: { categories: ["percent-to-decimal", "decimal-to-percent"], difficulty: "medium" } });
      });
      await waitForScreen(page, "race");
      await waitForGo(page, 180_000);
      const seen = new Set<string>();
      for (let round = 0; round < 10; round += 1) {
        const question = await shownQuestion(page);
        expectWording(question.text, question.choices);
        seen.add(TO_PERCENT.test(question.text) ? "to-percent" : "to-decimal");
        await fits(page, ".race-question", ".race-ask");
        if (round === 0) await evidence(page, `wording-computer-${viewport.width}x${viewport.height}`);
        const before = (await raceView(page))!;
        const correctly = round !== 4;
        await raceAnswer(page, correctly);
        const after = (await raceView(page))!;
        expect(after.correct).toBe(before.correct + (correctly ? 1 : 0));
        expect(after.wrong).toBe(before.wrong + (correctly ? 0 : 1));
      }
      expect([...seen].sort()).toEqual(["to-decimal", "to-percent"]);
      await assertNoHorizontalScroll(page);
      await page.evaluate(() => (window as unknown as { __MATH_RACE__: { race: { driver: { quit(): Promise<void> } } } }).__MATH_RACE__.race.driver.quit());
      await context.close();
    });
  }

  test("Online Race: the creator, a phone guest and an HTTP racer are all asked in words, and the server checks the conversion", async ({ browser }) => {
    test.setTimeout(600_000);
    const creator = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await creator.context.addInitScript(CONVERSIONS_ONLY, "easy");
    await signIn(creator.page, CREATOR);
    await waitForScreen(creator.page, "hub");
    await creator.page.getByRole("button", { name: /Online Race/ }).click();
    await waitForScreen(creator.page, "online");
    // The room is set up with the two conversion skills only.
    await expect(creator.page.locator(".skills .field-hint, .skills [id$='-skills-hint']").first()).toContainText("2 of 7 skills");
    await creator.page.locator("#creator-name").fill("Casey");
    await creator.page.getByRole("button", { name: "Create room" }).click();
    await waitForScreen(creator.page, "online-lobby");
    const code = (await creator.page.locator("#join-code").textContent())!.trim();

    const guest = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await guest.context.addInitScript(CONVERSIONS_ONLY, "easy");
    await guest.page.goto(`/join?code=${code}`);
    await waitForScreen(guest.page, "join");
    await guest.page.locator("#name").fill("Ava");
    await guest.page.locator("#join-game").click();
    await waitForScreen(guest.page, "online-lobby");

    const remote = new HttpRacer(BASE_URL, { name: "Cleo", colour: "green", thinkMs: 600, accuracy: 1, extraHeaders: HTTP_RACER_HEADERS });
    expect((await remote.join(code)).status).toBe(200);
    await expect(creator.page.locator(".player")).toHaveCount(3, { timeout: 20_000 });

    await creator.page.getByRole("button", { name: "Start race" }).click();
    await Promise.all([waitForScreen(creator.page, "race", 60_000), waitForScreen(guest.page, "race", 60_000)]);
    await Promise.all([waitForGo(creator.page, 120_000), waitForGo(guest.page, 120_000)]);

    for (const page of [creator.page, guest.page]) {
      for (let round = 0; round < 5; round += 1) {
        const question = await shownQuestion(page);
        expectWording(question.text, question.choices);
        await fits(page, ".race-question", ".race-ask");
        const before = (await raceView(page))!;
        await raceAnswer(page, round !== 2);
        const after = (await raceView(page))!;
        // The server judged it: the sentence's own answer counts, the other one does not.
        expect(after.correct).toBe(before.correct + (round !== 2 ? 1 : 0));
      }
    }
    await evidence(creator.page, "wording-online-creator-1366x768");
    await evidence(guest.page, "wording-online-guest-390x844");

    // The HTTP racer is sent the same wording (and no answer) by the server.
    for (let attempt = 0; attempt < 40 && remote.room.phase !== "ACTIVE"; attempt += 1) {
      await new Promise((done) => setTimeout(done, 250));
      await remote.poll();
    }
    for (let round = 0; round < 4; round += 1) {
      const question = remote.room.question;
      expectWording(question.text, question.choices);
      expect(Object.keys(question)).not.toContain("answer");
      expect(Object.keys(question)).not.toContain("correctIndex");
      const before = remote.me.correct;
      // Wait out the rest after the last answer, as a browser does.
      while (remote.raceMs() < Math.max(0, remote.me.lockedUntil) + 40) await new Promise((done) => setTimeout(done, 60));
      expect((await remote.answer(true))!.body.result).toBe("ok");
      expect(remote.me.correct).toBe(before + 1);
    }

    await creator.page.getByRole("button", { name: "Leave the race" }).click();
    await creator.page.getByRole("button", { name: "End the race for everyone" }).click();
    await remote.leave();
    await creator.context.close();
    await guest.context.close();
  });
});
