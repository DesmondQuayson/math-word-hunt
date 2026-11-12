import { expect, test } from "@playwright/test";

import { OWNER, PAGE_ERRORS, answer, assertNoScroll, choice, classroomPhase, evidence, newPage, openClassroom, signIn, teamState, type Team } from "./helpers";

const TEAMS: Team[] = ["turquoise", "pink"];

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

async function trackFacts(page: import("@playwright/test").Page, team: Team) {
  return page.evaluate((key) => {
    const host = document.querySelector<HTMLElement>(`.cr-team-${key} .cr-track`)!;
    const labels = [...host.querySelectorAll(".tile .tile-label")].map((node) => node.textContent ?? "");
    const tiles = [...host.querySelectorAll<SVGGElement>(".tile")].map((node) => {
      const box = node.querySelector(".tile-disc")!.getBoundingClientRect();
      const text = { height: Number.parseFloat(getComputedStyle(node.querySelector(".tile-label")!).fontSize) };
      return { state: node.dataset.state, x: box.x + box.width / 2, y: box.y + box.height / 2, size: box.width, textHeight: text.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    const ball = host.querySelector(".ball-skin")!.getBoundingClientRect();
    const area = host.getBoundingClientRect();
    return {
      labels,
      tiles,
      ball: { x: ball.x + ball.width / 2, y: ball.y + ball.height / 2 },
      area: { left: area.left, right: area.right, top: area.top, bottom: area.bottom },
      position: Number(host.dataset.position),
      badge: host.querySelector(".ball-badge text")?.textContent ?? "",
      badgeVisible: host.querySelector(".ball-badge")?.getAttribute("visibility") === "visible"
    };
  }, team);
}

async function panelFacts(page: import("@playwright/test").Page, team: Team) {
  return page.evaluate((key) => {
    const panel = document.querySelector<HTMLElement>(`.cr-team-${key}`)!;
    return {
      name: panel.querySelector(".cr-name")!.textContent,
      count: panel.querySelector(".cr-count")!.textContent,
      left: panel.querySelector(".cr-left")!.textContent,
      question: panel.querySelector(".cr-question-text")!.textContent,
      choices: [...panel.querySelectorAll(".cr-choice-label")].map((node) => node.textContent)
    };
  }, team);
}

test.describe("Classroom Competition on a Smart Board", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("two large winding tracks, each numbered 1 to 62, START before 1 and FINISH after 62", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1920, height: 1080 } });
    await signIn(page, OWNER);
    await openClassroom(page, { start: false });
    await evidence(page, "classroom-1920x1080-ready");
    for (const team of TEAMS) {
      const facts = await trackFacts(page, team);
      expect(facts.labels).toEqual(["START", ...Array.from({ length: 62 }, (_, index) => String(index + 1)), "FINISH"]);
      // Large and readable from the back of a room: at least 56 px across, numbers set at 24 px or more.
      const spaces = facts.tiles.slice(1, 63);
      expect(Math.min(...spaces.map((tile) => tile.size))).toBeGreaterThanOrEqual(56);
      expect(Math.min(...spaces.map((tile) => tile.textHeight))).toBeGreaterThanOrEqual(24);
      // Every space is inside the track area and no two overlap.
      for (const tile of facts.tiles) {
        expect(tile.left).toBeGreaterThanOrEqual(facts.area.left - 1);
        expect(tile.right).toBeLessThanOrEqual(facts.area.right + 1);
        expect(tile.top).toBeGreaterThanOrEqual(facts.area.top - 1);
        expect(tile.bottom).toBeLessThanOrEqual(facts.area.bottom + 1);
      }
      for (let a = 0; a < facts.tiles.length; a += 1) {
        for (let b = a + 1; b < facts.tiles.length; b += 1) {
          expect(Math.hypot(facts.tiles[a].x - facts.tiles[b].x, facts.tiles[a].y - facts.tiles[b].y)).toBeGreaterThan(facts.tiles[a].size);
        }
      }
      // The football starts on START.
      expect(facts.position).toBe(0);
      expect(Math.hypot(facts.ball.x - facts.tiles[0].x, facts.ball.y - facts.tiles[0].y)).toBeLessThan(facts.tiles[0].size * 0.4);
    }
    await assertNoScroll(page);
    await context.close();
  });

  test("both teams play at the same time with different questions; +1 for correct, 0 for wrong", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1920, height: 1080 } });
    await signIn(page, OWNER);
    await openClassroom(page, { names: { turquoise: "Sharks", pink: "Rockets" } });

    const turquoise = await panelFacts(page, "turquoise");
    const pink = await panelFacts(page, "pink");
    expect(turquoise.name).toBe("Sharks");
    expect(pink.name).toBe("Rockets");
    expect(turquoise.count).toBe("0 / 62");
    expect(turquoise.left).toBe("62 STEPS LEFT");
    expect(turquoise.choices).toHaveLength(2);
    expect(pink.choices).toHaveLength(2);
    expect(turquoise.question).not.toBe(pink.question);

    // Both teams' buttons are live together: neither waits for the other.
    for (const team of TEAMS) for (const index of [0, 1]) await expect(choice(page, team, index)).toBeEnabled();

    // Pink answers correctly; Turquoise is untouched.
    const turquoiseBefore = await teamState(page, "turquoise");
    await answer(page, "pink", true);
    expect((await teamState(page, "pink")).position).toBe(1);
    expect(await teamState(page, "turquoise")).toEqual(turquoiseBefore);
    expect((await panelFacts(page, "pink")).count).toBe("1 / 62");
    expect((await panelFacts(page, "pink")).left).toBe("61 STEPS LEFT");
    expect((await panelFacts(page, "turquoise")).question).toBe(turquoise.question);

    // A wrong answer: no step forward, no step back, a new question.
    await answer(page, "pink", false);
    expect((await teamState(page, "pink")).position).toBe(1);
    expect((await teamState(page, "pink")).wrong).toBe(1);
    expect((await panelFacts(page, "pink")).count).toBe("1 / 62");

    // Ball, glowing spaces, badge, counter and steps left always agree.
    for (let step = 0; step < 6; step += 1) await answer(page, "turquoise", true);
    await answer(page, "turquoise", false);
    for (const team of TEAMS) {
      const state = await teamState(page, team);
      const track = await trackFacts(page, team);
      const panel = await panelFacts(page, team);
      expect(track.position).toBe(state.position);
      expect(track.badge).toBe(String(state.position));
      expect(track.badgeVisible).toBe(true);
      expect(track.tiles.filter((tile) => tile.state === "done")).toHaveLength(state.position);
      expect(track.tiles.filter((tile) => tile.state === "here")).toHaveLength(1);
      expect(track.tiles[state.position].state).toBe("here");
      expect(panel.count).toBe(`${state.position} / 62`);
      expect(panel.left).toBe(`${62 - state.position} STEPS LEFT`);
      // The ball is on its numbered space, not somewhere else on the board.
      const here = track.tiles[state.position];
      expect(Math.hypot(track.ball.x - here.x, track.ball.y - here.y)).toBeLessThan(here.size * 0.4);
    }
    await evidence(page, "classroom-1920x1080-playing");
    await assertNoScroll(page);
    await context.close();
  });

  test("the football travels along the track, never across the board", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1920, height: 1080 } });
    await signIn(page, OWNER);
    await openClassroom(page);
    const before = await trackFacts(page, "turquoise");
    const state = await teamState(page, "turquoise");
    // Sample the ball every frame during one hop.
    const samples = page.evaluate(
      () =>
        new Promise<{ x: number; y: number }[]>((done) => {
          const points: { x: number; y: number }[] = [];
          const host = document.querySelector<HTMLElement>(".cr-team-turquoise .cr-track")!;
          const started = performance.now();
          let landedAt = 0;
          // Sample every frame from before the press until a moment after the ball has landed.
          const tick = () => {
            const box = host.querySelector(".ball-skin")!.getBoundingClientRect();
            points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
            if (!landedAt && host.dataset.position === "1") landedAt = performance.now();
            if ((landedAt && performance.now() - landedAt > 150) || performance.now() - started > 8000) done(points);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })
    );
    await choice(page, "turquoise", state.correctIndex).click();
    const points = await samples;
    const from = before.tiles[0];
    const to = before.tiles[1];
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    // A headless Safari engine draws few frames; what matters is where the ball was in each.
    expect(points.length).toBeGreaterThanOrEqual(2);
    for (const point of points) {
      // Always between the two spaces (plus the height of the hop), never further away.
      expect(Math.hypot(point.x - from.x, point.y - from.y)).toBeLessThanOrEqual(span + from.size);
      expect(Math.hypot(point.x - to.x, point.y - to.y)).toBeLessThanOrEqual(span + from.size);
    }
    const last = points[points.length - 1];
    expect(Math.hypot(last.x - to.x, last.y - to.y)).toBeLessThan(to.size * 0.4);
    await context.close();
  });

  test("a double tap moves one space, and two teams can press in the same instant", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1920, height: 1080 }, hasTouch: true });
    await signIn(page, OWNER);
    await openClassroom(page);

    // Double tap on the correct button.
    const state = await teamState(page, "pink");
    const button = choice(page, "pink", state.correctIndex);
    await button.dispatchEvent("pointerdown", { pointerId: 5, pointerType: "touch", isPrimary: true, button: 0 });
    await button.dispatchEvent("pointerdown", { pointerId: 5, pointerType: "touch", isPrimary: true, button: 0 });
    await button.dispatchEvent("click");
    // Wait for Pink's next question to be up and its buttons awake (a slow machine takes longer than a fixed pause).
    await page.waitForFunction(
      (previous) => {
        const hook = (window as unknown as { __MATH_RACE__: { classroom: { match: { team(team: string): { question: { key: string } } } } } }).__MATH_RACE__.classroom.match;
        const pinkButton = document.querySelector<HTMLButtonElement>('.cr-choice[data-team="pink"]');
        return hook.team("pink").question.key !== previous && pinkButton !== null && !pinkButton.disabled;
      },
      state.key,
      { timeout: 15_000, polling: 50 }
    );
    await page.waitForTimeout(300);
    expect((await teamState(page, "pink")).position).toBe(1);

    // Two fingers, two teams, one event-loop turn.
    const [turquoise, pink] = [await teamState(page, "turquoise"), await teamState(page, "pink")];
    await page.evaluate(
      ([left, right]) => {
        const press = (team: string, index: number, pointerId: number) =>
          document
            .querySelector(`.cr-choice[data-team="${team}"][data-choice="${index}"]`)!
            .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId, pointerType: "touch", isPrimary: pointerId === 11, button: 0 }));
        press("turquoise", left, 11);
        press("pink", right, 12);
      },
      [turquoise.correctIndex, pink.correctIndex] as const
    );
    await page.waitForFunction(
      ([left, right]) => {
        const hook = (window as unknown as { __MATH_RACE__: { classroom: { match: { team(team: string): { position: number } } } } }).__MATH_RACE__.classroom.match;
        return hook.team("turquoise").position > left || hook.team("pink").position > right;
      },
      [turquoise.position, pink.position] as const,
      { timeout: 15_000, polling: 50 }
    ).catch(() => {});
    await page.waitForTimeout(700);
    expect((await teamState(page, "turquoise")).position).toBe(turquoise.position + 1);
    expect((await teamState(page, "pink")).position).toBe(pink.position + 1);
    await context.close();
  });

  test("keyboard: A/S for Turquoise, K/L for Pink, with visible focus on the answer buttons", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1920, height: 1080 } });
    await signIn(page, OWNER);
    await openClassroom(page);
    const turquoise = await teamState(page, "turquoise");
    await page.keyboard.press(turquoise.correctIndex === 0 ? "a" : "s");
    const pink = await teamState(page, "pink");
    await page.keyboard.press(pink.correctIndex === 0 ? "k" : "l");
    await page.waitForTimeout(700);
    expect((await teamState(page, "turquoise")).position).toBe(1);
    expect((await teamState(page, "pink")).position).toBe(1);

    // Tab reaches an answer button and shows a focus ring; Enter answers.
    const target = choice(page, "turquoise", (await teamState(page, "turquoise")).correctIndex);
    await target.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const ring = await target.evaluate((node) => getComputedStyle(node).boxShadow);
    expect(ring).not.toBe("none");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    expect((await teamState(page, "turquoise")).position).toBe(2);
    await context.close();
  });

  test("first to the last space wins: celebration, results, restart (30-space practice race)", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1920, height: 1080 } });
    await signIn(page, OWNER);
    await openClassroom(page, { length: 30 });
    expect((await trackFacts(page, "pink")).labels).toHaveLength(32);
    for (let step = 0; step < 12; step += 1) await answer(page, "turquoise", true);
    for (let step = 0; step < 30; step += 1) await answer(page, "pink", true);
    await expect(page.locator("#cr-results-title")).toHaveText("Team Pink wins!", { timeout: 15_000 });
    expect(await classroomPhase(page)).toBe("finished");
    expect((await panelFacts(page, "pink")).count).toBe("30 / 30");
    expect((await panelFacts(page, "pink")).left).toBe("FINISHED!");
    expect((await panelFacts(page, "turquoise")).count).toBe("12 / 30");
    await expect(page.locator(".classroom")).toHaveAttribute("data-winner", "pink");
    // The loser can no longer move.
    for (const index of [0, 1]) await expect(choice(page, "turquoise", index)).toBeDisabled();
    await evidence(page, "classroom-1920x1080-results");

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.getByRole("button", { name: "Start the race" })).toBeVisible();
    for (const team of TEAMS) {
      expect((await teamState(page, team)).position).toBe(0);
      expect((await trackFacts(page, team)).position).toBe(0);
      expect((await panelFacts(page, team)).count).toBe("0 / 30");
    }
    await context.close();
  });
});

for (const [width, height, minimum] of [
  [1366, 768, 34],
  [1024, 768, 30]
] as const) {
  test(`${width}x${height}: both tracks and both question panels fit with no scrolling`, async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width, height } });
    await signIn(page, OWNER);
    await openClassroom(page);
    for (let step = 0; step < 5; step += 1) await answer(page, "turquoise", true);
    for (let step = 0; step < 3; step += 1) await answer(page, "pink", true);
    await assertNoScroll(page);
    for (const team of TEAMS) {
      const facts = await trackFacts(page, team);
      expect(facts.labels).toHaveLength(64);
      expect(Math.min(...facts.tiles.map((tile) => tile.size))).toBeGreaterThanOrEqual(minimum);
      for (const index of [0, 1]) {
        const box = (await choice(page, team, index).boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        expect(box.height).toBeGreaterThanOrEqual(56);
        expect(box.width).toBeGreaterThanOrEqual(120);
      }
    }
    await evidence(page, `classroom-${width}x${height}-playing`);
    await context.close();
  });
}

test("reduced motion: the football lands at once and everything still agrees", async ({ browser }) => {
  const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  await signIn(page, OWNER);
  await openClassroom(page);
  const state = await teamState(page, "turquoise");
  await choice(page, "turquoise", state.correctIndex).click();
  // No waiting for an animation: the landing is immediate.
  const facts = await trackFacts(page, "turquoise");
  expect(facts.position).toBe(1);
  expect(facts.badge).toBe("1");
  expect((await panelFacts(page, "turquoise")).count).toBe("1 / 62");
  await context.close();
});
