import { expect, test } from "@playwright/test";

import {
  MINUS,
  SKILLS,
  answer,
  axeSeriousOrCritical,
  expectNoHorizontalOverflow,
  keysFor,
  openGame,
  panel,
  questionText,
  ropePosition,
  solve,
  startLocal,
  tapKeys,
  waitForUnlocked,
  type Skill
} from "./helpers";

const QUESTION_SHAPES: Record<Skill, RegExp> = {
  addition: /^(\d{1,2}) \+ (\d{1,2})$/,
  subtraction: new RegExp(`^(\\d{1,2}) ${MINUS} (\\d{1,2})$`),
  multiplication: /^(\d{1,2}) × (\d{1,2})$/u,
  integers: new RegExp(`^${MINUS}?\\d{1,2} [+${MINUS}] (\\(${MINUS}\\d{1,2}\\)|\\d{1,2})$`),
  opposite: new RegExp(`^What is the opposite of ${MINUS}?\\d{1,2}\\?$`),
  absolute: new RegExp(`^\\|${MINUS}?\\d{1,2}\\|$`)
};

const isDesktop = (projectName: string) => projectName.includes("desktop");

test.describe("Math Tug of War — local modes", () => {
  test("home offers exactly VS Robot, Two Teams and Online Match with no timer, difficulty or tutorial", async ({ page }) => {
    await openGame(page);
    await expect(page.locator("button.mode-card")).toHaveCount(3);
    await expect(page.locator("button[data-mode=robot]")).toContainText("VS Robot");
    await expect(page.locator("button[data-mode=robot]")).toContainText("Play against the computer");
    await expect(page.locator("button[data-mode=robot]")).toContainText("One Player");
    await expect(page.locator("button[data-mode=teams]")).toContainText("Play together on one device");
    await expect(page.locator("button[data-mode=online]")).toContainText("Play from two devices");
    await expect(page.getByText("Answer correctly to pull the other team across the line.")).toBeVisible();
    await expect(page.getByText("Solve the math. Pull the rope. Beat the other side!")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\b(easy|medium|hard|expert|timer|countdown|tutorial|how to play)\b/i);
    for (const mode of ["robot", "teams"] as const) {
      await page.locator(`button[data-mode=${mode}]`).click();
      const setup = await page.locator("body").innerText();
      expect(setup).not.toMatch(/\b(easy|medium|hard|expert|difficulty|timer)\b/i);
      await expect(page.locator("input[name=skill]")).toHaveCount(6);
      await page.getByRole("button", { name: "Back" }).click();
    }
  });

  test("setup lists the six skills in order, with the full integer title", async ({ page }) => {
    await openGame(page);
    await page.locator("button[data-mode=teams]").click();
    await expect(page.getByRole("heading", { name: /Two Teams/ })).toBeVisible();
    await expect(page.getByLabel("Team 1 Name")).toBeVisible();
    await expect(page.getByLabel("Team 2 Name")).toBeVisible();
    const titles = await page.locator(".skill-option .skill-full").allTextContents();
    expect(titles).toEqual(["Addition", "Subtraction", "Multiplication", "Addition & Subtraction of Integers", "Opposite of Integers", "Absolute Value"]);
    await page.locator("button[data-mode]").count();
    await page.getByRole("button", { name: "Back" }).click();
    await page.locator("button[data-mode=robot]").click();
    await expect(page.getByText("MathNexa Robot")).toBeVisible();
    await expect(page.getByLabel("Your Name")).toBeVisible();
  });

  test("default team names are used when inputs are empty", async ({ page }) => {
    await startLocal(page, "teams", "addition", { turquoise: "  ", pink: "" });
    await expect(panel(page, "turquoise").locator(".panel-name")).toHaveText("Team 1");
    await expect(panel(page, "pink").locator(".panel-name")).toHaveText("Team 2");
  });

  test("names are sanitised and rendered as text only", async ({ page }) => {
    await startLocal(page, "teams", "addition", { turquoise: "<img src=x onerror=alert(1)>", pink: "Comets with a very long team name" });
    await expect(page.locator(".team-panel img, .top-bar img")).toHaveCount(0);
    const name = await panel(page, "turquoise").locator(".panel-name").textContent();
    // The input caps typing at 20 characters; sanitising then drops the angle brackets.
    expect(name).toBe("img src=x onerror=a");
    expect((await panel(page, "pink").locator(".panel-name").textContent())?.length).toBeLessThanOrEqual(20);
  });

  for (const skill of SKILLS) {
    test(`${skill}: question shape, keypad signs, correct pull and no pull when wrong`, async ({ page }) => {
      await startLocal(page, "teams", skill, { turquoise: "Sharks", pink: "Comets" });
      const signed = skill === "integers" || skill === "opposite" || skill === "absolute";
      await expect(panel(page, "turquoise").locator('.key[data-key="-"]')).toHaveCount(signed ? 1 : 0);
      await expect(panel(page, "turquoise").locator('.key[data-key="+"]')).toHaveCount(signed ? 1 : 0);
      for (let round = 0; round < 3; round += 1) {
        const text = await questionText(page, "turquoise");
        expect(text).toMatch(QUESTION_SHAPES[skill]);
        const value = solve(text);
        if (skill === "subtraction" || skill === "absolute" || skill === "addition" || skill === "multiplication") expect(value).toBeGreaterThanOrEqual(0);
        await waitForUnlocked(page, "turquoise");
        await answer(page, "turquoise", { wrong: true });
        await expect(panel(page, "turquoise")).toHaveAttribute("data-result", "incorrect");
        expect(await ropePosition(page)).toBe(0);
        await waitForUnlocked(page, "turquoise");
      }
      await answer(page, "turquoise");
      await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "-1");
      await expect(panel(page, "turquoise").locator(".panel-pulls")).toHaveText("Pulls: 1");
      await answer(page, "pink");
      await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "0");
      await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-last-pull", "pink");
    });
  }

  test("Two Teams play simultaneously: one team's entry never touches the other's", async ({ page }) => {
    await startLocal(page, "teams", "integers", { turquoise: "Sharks", pink: "Comets" });
    await tapKeys(page, "turquoise", ["-"]);
    const pinkBefore = await questionText(page, "pink");
    await answer(page, "pink");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "1");
    await expect(panel(page, "turquoise").locator(".answer-value")).toHaveText(MINUS);
    expect(await questionText(page, "pink")).not.toBe("");
    await tapKeys(page, "turquoise", ["clear"]);
    await answer(page, "turquoise");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "0");
    expect(pinkBefore).not.toBe("");

    // Two touches at the same instant (Smart Board): both land on their own side.
    await waitForUnlocked(page, "turquoise");
    await waitForUnlocked(page, "pink");
    await page.evaluate(() => {
      const press = (team: string, key: string) => document
        .querySelector(`.team-panel.team-${team} .key[data-key="${key}"]`)!
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch", pointerId: team === "turquoise" ? 11 : 12, isPrimary: team === "turquoise" }));
      press("turquoise", "4");
      press("pink", "7");
    });
    await expect(panel(page, "turquoise").locator(".answer-value")).toHaveText("4");
    await expect(panel(page, "pink").locator(".answer-value")).toHaveText("7");
  });

  test("signed keypad: minus, plus, clear and malformed-sign rejection", async ({ page }) => {
    await startLocal(page, "teams", "integers", { turquoise: "Sharks", pink: "Comets" });
    const display = panel(page, "turquoise").locator(".answer-value");
    await tapKeys(page, "turquoise", ["-", "-"]);
    await expect(display).toHaveText("?");
    await tapKeys(page, "turquoise", ["-", "7", "-", "+"]);
    await expect(display).toHaveText(`${MINUS}7`);
    await tapKeys(page, "turquoise", ["backspace"]);
    await expect(display).toHaveText(MINUS);
    await tapKeys(page, "turquoise", ["+"]);
    await expect(display).toHaveText("+");
    await tapKeys(page, "turquoise", ["clear"]);
    await expect(display).toHaveText("?");
    await tapKeys(page, "turquoise", ["submit"]);
    await expect(panel(page, "turquoise")).toHaveAttribute("data-feedback", "hint");
    expect(await ropePosition(page)).toBe(0);
  });

  test("positive answers accept a leading plus; negative answers use the minus key", async ({ page }) => {
    await startLocal(page, "teams", "opposite", { turquoise: "Sharks", pink: "Comets" });
    let pulls = 0;
    let sawNegative = false;
    let sawPositive = false;
    for (let attempt = 0; attempt < 12 && !(sawNegative && sawPositive); attempt += 1) {
      const team = attempt % 2 === 0 ? "turquoise" : "pink";
      await waitForUnlocked(page, team);
      const value = solve(await questionText(page, team));
      if (value < 0) sawNegative = true;
      if (value > 0) sawPositive = true;
      await tapKeys(page, team, [...keysFor(value, { plus: value > 0 }), "submit"]);
      pulls += 1;
      await expect(panel(page, team)).toHaveAttribute("data-result", "correct");
    }
    expect(pulls).toBeGreaterThan(0);
    expect(sawNegative || sawPositive).toBe(true);
  });

  test("physical keyboard goes to exactly one team at a time", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.name), "physical keyboard is a desktop concern");
    await startLocal(page, "teams", "integers", { turquoise: "Sharks", pink: "Comets" });
    await panel(page, "pink").locator(".question").click();
    const value = solve(await questionText(page, "pink"));
    await page.keyboard.type(value < 0 ? `-${Math.abs(value)}` : String(value));
    await expect(panel(page, "turquoise").locator(".answer-value")).toHaveText("?");
    await page.keyboard.press("Enter");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "1");
    await expect(panel(page, "turquoise").locator(".answer-value")).toHaveText("?");
    await panel(page, "turquoise").locator(".question").click();
    await page.keyboard.type("12");
    await page.keyboard.press("Backspace");
    await expect(panel(page, "turquoise").locator(".answer-value")).toHaveText("1");
    await page.keyboard.press("Delete");
    await expect(panel(page, "turquoise").locator(".answer-value")).toHaveText("?");
    await page.keyboard.press("-");
    await page.keyboard.press("5");
    await expect(panel(page, "turquoise").locator(".answer-value")).toHaveText(`${MINUS}5`);
    await expect(panel(page, "pink").locator(".answer-value")).toHaveText("?");
  });

  test("VS Robot: the robot thinks, plays its own questions and only pulls on correct answers", async ({ page }) => {
    await startLocal(page, "robot", "addition", { turquoise: "Ava" });
    await expect(page.locator(".robot-card")).toContainText("MathNexa Robot");
    await expect(page.locator(".robot-status")).toHaveText("Thinking…");
    await answer(page, "turquoise");
    await expect(panel(page, "turquoise").locator(".panel-pulls")).toHaveText("Pulls: 1");
    await waitForUnlocked(page, "turquoise");
    await answer(page, "turquoise", { wrong: true });
    await expect(panel(page, "turquoise").locator(".panel-pulls")).toHaveText("Pulls: 1");
    // The robot answers after a natural delay (never instantly).
    await expect(page.locator(".robot-status")).toHaveText(/Pulled!|Missed one/, { timeout: 12_000 });
    await expect(page.locator(".robot-pulls")).toHaveText(/Pulls: [1-9]/, { timeout: 30_000 });
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\b(easy|medium|hard|expert)\b/i);
  });

  test("Turquoise victory: the rope crosses the line, winner shown, Play Again resets and keeps names", async ({ page }) => {
    await startLocal(page, "teams", "multiplication", { turquoise: "Sharks", pink: "Comets" });
    for (let pull = 1; pull <= 5; pull += 1) {
      await waitForUnlocked(page, "turquoise");
      await answer(page, "turquoise");
      await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", String(-pull));
    }
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Sharks WINS!" })).toBeVisible({ timeout: 8_000 });
    await expect(dialog.getByRole("button", { name: "Play Again" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Change Game Setup" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Back to Math Games" })).toBeVisible();
    await expect(page.locator(".tug-scene-svg")).toHaveClass(/won-turquoise/);
    const violations = await axeSeriousOrCritical(page);
    expect(violations).toEqual([]);
    await dialog.getByRole("button", { name: "Play Again" }).click();
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "0");
    await expect(panel(page, "turquoise").locator(".panel-name")).toHaveText("Sharks");
    await expect(panel(page, "turquoise").locator(".panel-pulls")).toHaveText("Pulls: 0");
    await expect(page.locator(".skill-chip .skill-full")).toHaveText("Multiplication");
  });

  test("Pink victory, then Change Game Setup keeps names and skill; Back to Math Games leaves", async ({ page }) => {
    await startLocal(page, "teams", "absolute", { turquoise: "Sharks", pink: "Comets" });
    for (let pull = 1; pull <= 5; pull += 1) {
      await waitForUnlocked(page, "pink");
      await answer(page, "pink");
    }
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Comets WINS!" })).toBeVisible({ timeout: 8_000 });
    expect(await ropePosition(page)).toBe(5);
    await dialog.getByRole("button", { name: "Change Game Setup" }).click();
    await expect(page.locator("#team-1-name")).toHaveValue("Sharks");
    await expect(page.locator("#team-2-name")).toHaveValue("Comets");
    await expect(page.locator("#skill-absolute")).toBeChecked();
    await page.getByRole("button", { name: "Start Game" }).click();
    for (let pull = 1; pull <= 5; pull += 1) {
      await waitForUnlocked(page, "pink");
      await answer(page, "pink");
    }
    await page.getByRole("dialog").getByRole("button", { name: "Back to Math Games" }).click();
    await expect(page).toHaveURL(/\/games\/?$/);
  });

  test("reduced motion still shows who pulled and where the rope is", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await startLocal(page, "teams", "addition", { turquoise: "Sharks", pink: "Comets" });
    await answer(page, "turquoise");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "-1");
    await expect(page.locator(".scene-status")).toHaveText("Sharks pulled!");
    await expect(page.locator(".tug-scene-svg title")).toHaveText(/Sharks leads by 1 pull/);
    const moving = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length);
    expect(moving).toBe(0);
    await context.close();
  });

  test("Online Match unavailable does not break the local modes", async ({ page }) => {
    await openGame(page);
    await page.locator("button[data-mode=online]").click();
    await page.locator("button[data-online=create]").click();
    await page.fill("#online-name", "Ava");
    await page.getByRole("button", { name: "Create Room" }).click();
    await expect(page.getByRole("alert")).toHaveText("Online Match is temporarily unavailable.");
    await page.getByRole("button", { name: "Back" }).click();
    await page.locator("button[data-online=join]").click();
    await page.fill("#room-code", "AB1");
    await page.getByRole("button", { name: "Join Game" }).click();
    await expect(page.getByRole("alert")).toHaveText("Check the room code. It has 5 letters and numbers.");
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await page.locator("button[data-mode=robot]").click();
    await page.getByRole("button", { name: "Start Game" }).click();
    await answer(page, "turquoise");
    await expect(panel(page, "turquoise").locator(".panel-pulls")).toHaveText("Pulls: 1");
  });

  test("music reuses the approved MathNexa track, loops, respects the saved preference and is released on exit", async ({ page }) => {
    await startLocal(page, "robot", "addition", { turquoise: "Ava" });
    await tapKeys(page, "turquoise", ["1"]);
    const snapshot = await page.evaluate(() => (window as unknown as { __MATHNEXA_GAME_MUSIC__: { snapshot(): Record<string, unknown> } }).__MATHNEXA_GAME_MUSIC__.snapshot());
    expect(String(snapshot.source)).toBe("/media/audio/cosmic-candy-catchers.mp3");
    expect(snapshot.loop).toBe(true);
    expect(Number(snapshot.playAttempts)).toBeGreaterThan(0);
    await page.locator('[data-action="music"]').click();
    await expect(page.locator('[data-action="music"]')).toHaveAttribute("aria-pressed", "false");
    const paused = await page.evaluate(() => (window as unknown as { __MATHNEXA_GAME_MUSIC__: { snapshot(): { paused: boolean } } }).__MATHNEXA_GAME_MUSIC__.snapshot().paused);
    expect(paused).toBe(true);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa:math-tug-of-war:preferences") ?? "{}"));
    expect(stored.music).toBe(false);
    await page.reload();
    await startLocal(page, "robot", "addition", { turquoise: "Ava" });
    await tapKeys(page, "turquoise", ["1"]);
    const afterReload = await page.evaluate(() => (window as unknown as { __MATHNEXA_GAME_MUSIC__: { snapshot(): { playAttempts: number; paused: boolean } } }).__MATHNEXA_GAME_MUSIC__.snapshot());
    expect(afterReload.playAttempts).toBe(0);
    await expect(page.locator('[data-action="music"]')).toHaveAttribute("aria-pressed", "false");
    await page.locator('[data-action="music"]').click();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    const released = await page.evaluate(() => (window as unknown as { __MATHNEXA_GAME_MUSIC__: { snapshot(): { disposed: boolean; source: string | null } } }).__MATHNEXA_GAME_MUSIC__.snapshot());
    expect(released.disposed).toBe(true);
    expect(released.source).toBeNull();
  });

  test("accessibility: home, setup and gameplay have no serious or critical axe violations", async ({ page }) => {
    await openGame(page);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.locator("button[data-mode=teams]").click();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByRole("button", { name: "Start Game" }).click();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await expect(page.locator('.key[data-key="submit"]').first()).toHaveAttribute("aria-label", "Submit answer");
    await expect(page.locator('#announcer')).toHaveAttribute("aria-live", "polite");
    await answer(page, "turquoise");
    await expect(page.locator("#announcer")).toContainText(/pulled/);
  });

  test("setup is fully keyboard operable with visible focus", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.name), "keyboard walk is a desktop concern");
    test.skip(testInfo.project.name.startsWith("webkit"), "Windows WebKit test build does not Tab-focus buttons by default");
    await openGame(page);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(focused.length).toBeGreaterThan(0);
    await page.locator("button[data-mode=teams]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#team-1-name")).toBeFocused();
    await page.keyboard.type("Sharks");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Comets");
    await page.keyboard.press("Enter");
    await expect(panel(page, "turquoise").locator(".panel-name")).toHaveText("Sharks");
    const outline = await page.evaluate(() => {
      const key = document.querySelector<HTMLButtonElement>('.team-panel.team-turquoise .key[data-key="5"]')!;
      key.focus();
      return getComputedStyle(key).outlineStyle;
    });
    expect(outline).not.toBe("none");
  });
});

test.describe("Math Tug of War — responsive certification", () => {
  const WIDTHS: Array<[number, number]> = [[304, 640], [320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1366, 768], [1920, 1080], [844, 390], [667, 375]];

  test("no horizontal overflow and every keypad key reachable, all modes and sizes", async ({ browser }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.name), "viewport sweep runs once per engine");
    for (const [width, height] of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000 });
      const page = await context.newPage();
      for (const [mode, skill] of [["teams", "integers"], ["robot", "opposite"]] as const) {
        await startLocal(page, mode, skill, { turquoise: "Sharks", pink: "Comets" });
        await expectNoHorizontalOverflow(page);
        const outside = await page.evaluate(() => [...document.querySelectorAll(".key")].filter(key => {
          const box = key.getBoundingClientRect();
          return box.bottom > innerHeight + 0.5 || box.right > innerWidth + 0.5 || box.left < -0.5 || box.top < -0.5 || box.height < 40 || box.width < 40;
        }).length);
        expect(outside, `${mode} ${width}x${height}`).toBe(0);
      }
      await openGame(page);
      await expectNoHorizontalOverflow(page);
      await page.locator("button[data-mode=teams]").click();
      await expectNoHorizontalOverflow(page);
      await context.close();
    }
  });

  test("200% text: setup and gameplay reflow without horizontal overflow", async ({ browser }, testInfo) => {
    test.skip(!isDesktop(testInfo.project.name), "text zoom sweep runs once per engine");
    for (const [width, height] of [[390, 844], [768, 1024], [1366, 768], [1920, 1080]] as Array<[number, number]>) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await openGame(page);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expectNoHorizontalOverflow(page);
      await page.locator("button[data-mode=teams]").click();
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expectNoHorizontalOverflow(page);
      for (const title of await page.locator(".skill-option .skill-full").all()) await expect(title).toBeVisible();
      await page.fill("#team-1-name", "Turquoise Tornadoes");
      await page.fill("#team-2-name", "Pink Powerhouses");
      await page.getByRole("button", { name: "Start Game" }).click();
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expectNoHorizontalOverflow(page);
      for (const team of ["turquoise", "pink"] as const) {
        const submit = panel(page, team).locator('.key[data-key="submit"]');
        await submit.scrollIntoViewIfNeeded();
        await expect(submit).toBeInViewport();
        const box = await submit.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(40);
      }
      await expect(panel(page, "turquoise").locator(".question")).toBeVisible();
      await context.close();
    }
  });
});
