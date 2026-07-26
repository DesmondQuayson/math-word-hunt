import { expect, test } from "@playwright/test";

const CANONICAL_PAGE = "/docs/index.html";

async function chooseGrade(page, grade) {
  await page.locator('.grade-card[data-grade="' + grade + '"]').click();
  await expect(page.locator("#topicScreen")).toBeVisible();
}

async function openFirstTopic(page) {
  const topic = page.locator(".topic-card:not(.incomplete)").first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await expect(page.locator("#lessonScreen")).toBeVisible();
}

async function launchFirstLesson(page, grade = "6") {
  await page.goto(CANONICAL_PAGE);
  await chooseGrade(page, grade);
  await openFirstTopic(page);
  await page.locator(".lesson-row").first().click();
  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator("#letterGrid .grid-cell").first()).toBeVisible();
}

async function firstPlacement(page) {
  return page.evaluate(() => {
    const game = window.__MATH_WORD_HUNT__.getState();
    const placement = game.placements[0];
    return {
      key: placement.key,
      start: placement.cells[0],
      end: placement.cells.at(-1)
    };
  });
}

function cellSelector(cell) {
  return (
    '.grid-cell[data-row="' +
    cell.row +
    '"][data-col="' +
    cell.col +
    '"]'
  );
}

test("canonical v7 launches and loads the canonical vocabulary", async ({
  page
}) => {
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  const vocabResponse = page.waitForResponse(
    (response) => response.url().endsWith("/docs/vocab.js")
  );

  await page.goto(CANONICAL_PAGE);
  expect((await vocabResponse).status()).toBe(200);
  await expect(page).toHaveTitle(/Math Word Hunt/);
  await expect(page.locator(".version-footer")).toContainText("v7");
  await expect(page.locator(".grade-card")).toHaveCount(3);

  const integrity = await page.evaluate(() => ({
    termCount: Object.keys(TERMS).length,
    grades: Object.keys(CURRICULUM),
    problems: selfCheck()
  }));
  expect(integrity).toEqual({
    termCount: 506,
    grades: ["6", "7", "8"],
    problems: []
  });
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("grade, team, topic, and lesson setup reaches a playable game", async ({
  page
}) => {
  await page.goto(CANONICAL_PAGE);
  await page.locator("#teamCountSelect").selectOption("3");
  const teamInputs = page.locator("#teamNameFields input");
  await expect(teamInputs).toHaveCount(3);
  await teamInputs.nth(0).fill("Blue Team");
  await teamInputs.nth(0).blur();

  await chooseGrade(page, "6");
  await openFirstTopic(page);
  await expect(page.locator(".lesson-row")).not.toHaveCount(0);
  await page.locator(".lesson-row").first().click();

  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator(".team-score")).toHaveCount(3);
  await expect(page.locator(".team-score").first()).toContainText("Blue Team");
  const state = await page.evaluate(() => window.__MATH_WORD_HUNT__.getState());
  expect(state.grade).toBe("6");
  expect(state.kind).toBe("lesson");
  expect(state.placements.length).toBeGreaterThan(0);
});

test("a complete canonical lesson round reaches the review screen", async ({
  page
}) => {
  await launchFirstLesson(page);
  await page.locator("#soundButton").click();
  await page.locator("#soundButton").click();
  await expect(page.locator("#soundButton")).toContainText("Muted");

  const placements = await page.evaluate(
    () => window.__MATH_WORD_HUNT__.getState().placements
  );
  for (const placement of placements) {
    await page
      .locator('.word-card[data-term-key="' + placement.key + '"]')
      .click();
    await page.locator(cellSelector(placement.cells[0])).click();
    await page.locator(cellSelector(placement.cells.at(-1))).click();
    await expect(page.locator("#findLayer")).toBeVisible();
    await page.locator("#gotItButton").click();
  }

  await expect(page.locator("#reviewLayer")).toBeVisible();
  const result = await page.evaluate(() => {
    const state = window.__MATH_WORD_HUNT__.getState();
    return {
      found: state.found.length,
      placeable: state.placements.length,
      score: state.scores.reduce((sum, value) => sum + value, 0)
    };
  });
  expect(result.found).toBe(result.placeable);
  expect(result.score).toBe(result.placeable);
});

test("keyboard users can navigate the grid and submit a word", async ({
  page
}) => {
  await launchFirstLesson(page);
  const placement = await firstPlacement(page);
  const term = page.locator('.word-card[data-term-key="' + placement.key + '"]');
  await term.focus();
  await term.press("Enter");

  const origin = page.locator('.grid-cell[data-row="0"][data-col="0"]');
  await origin.focus();
  await origin.press("ArrowRight");
  expect(
    await page.evaluate(() => ({
      row: document.activeElement?.dataset.row,
      col: document.activeElement?.dataset.col
    }))
  ).toEqual({ row: "0", col: "1" });

  const start = page.locator(cellSelector(placement.start));
  const end = page.locator(cellSelector(placement.end));
  await start.focus();
  await start.press("Enter");
  await end.focus();
  await end.press("Enter");

  await expect(page.locator("#findLayer")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => window.__MATH_WORD_HUNT__.getState().found.includes(key),
        placement.key
      )
    )
    .toBe(true);
});

test("Pointer Events can trace a selected word", async ({ page }) => {
  await launchFirstLesson(page);
  const placement = await firstPlacement(page);
  await page
    .locator('.word-card[data-term-key="' + placement.key + '"]')
    .click();

  const startBox = await page.locator(cellSelector(placement.start)).boundingBox();
  const endBox = await page.locator(cellSelector(placement.end)).boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();

  await page.mouse.move(
    startBox.x + startBox.width / 2,
    startBox.y + startBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    endBox.x + endBox.width / 2,
    endBox.y + endBox.height / 2,
    { steps: Math.max(4, placement.key.length) }
  );
  await page.mouse.up();

  await expect(page.locator("#findLayer")).toBeVisible();
  expect(
    await page.evaluate(
      (key) => window.__MATH_WORD_HUNT__.getState().found.includes(key),
      placement.key
    )
  ).toBe(true);
});

test("mobile gameplay stays within a 390 by 844 viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await launchFirstLesson(page);

  const layout = await page.evaluate(() => {
    const board = document.querySelector("#boardPanel").getBoundingClientRect();
    const controls = [...document.querySelectorAll(".teacher-bar button")];
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      boardLeft: board.left,
      boardRight: board.right,
      shortestControl: Math.min(
        ...controls.map((control) => control.getBoundingClientRect().height)
      )
    };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.boardLeft).toBeGreaterThanOrEqual(0);
  expect(layout.boardRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.shortestControl).toBeGreaterThanOrEqual(44);
});

test("reduced-motion preferences disable decorative motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(CANONICAL_PAGE);

  const motion = await page.evaluate(() => {
    const card = document.querySelector(".grade-card");
    const confetti = document.createElement("i");
    confetti.className = "confetti-piece";
    document.body.append(confetti);
    const result = {
      transitionDuration: getComputedStyle(card).transitionDuration,
      confettiDisplay: getComputedStyle(confetti).display
    };
    confetti.remove();
    return result;
  });
  expect(parseFloat(motion.transitionDuration)).toBeLessThanOrEqual(0.00001);
  expect(motion.confettiDisplay).toBe("none");
});

test("blocked Web Audio and speech APIs never block gameplay", async ({
  page
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined
    });
  });

  await launchFirstLesson(page);
  const placement = await firstPlacement(page);
  await page
    .locator('.word-card[data-term-key="' + placement.key + '"]')
    .click();
  await page.locator(cellSelector(placement.start)).click();
  await page.locator(cellSelector(placement.end)).click();

  await expect(page.locator("#findLayer")).toBeVisible();
  expect(
    await page.evaluate(
      () => window.__MATH_WORD_HUNT__.getAudioState().contextState
    )
  ).toBe("not-created");
  expect(errors).toEqual([]);
});

test("missing lessons are disabled and thin lessons support Combine Mode", async ({
  page
}) => {
  await page.goto(CANONICAL_PAGE);
  await chooseGrade(page, "6");
  const missingTopic = page.locator(".topic-card.incomplete");
  await expect(missingTopic).toHaveCount(1);
  await expect(missingTopic).toHaveAttribute("aria-disabled", "true");
  await expect(missingTopic).toContainText(
    "Coming soon — vocabulary not yet added"
  );
  await expect(missingTopic.locator(".choose-topic-button")).toHaveCount(0);

  await page.goto(CANONICAL_PAGE);
  await chooseGrade(page, "7");
  await openFirstTopic(page);
  await expect(
    page.locator('.lesson-row[data-lesson-id="1-2"] .lesson-word-count')
  ).toContainText("2 words");

  await page.locator("#combineLessonsButton").click();
  await page.getByRole("checkbox", { name: "Combine lesson 1-2" }).check();
  await page.getByRole("checkbox", { name: "Combine lesson 1-10" }).check();
  await expect(page.locator("#startCombinedButton")).toBeEnabled();
  await page.locator("#startCombinedButton").click();
  await expect(page.locator("#gameScreen")).toBeVisible();

  const state = await page.evaluate(() => window.__MATH_WORD_HUNT__.getState());
  expect(state.kind).toBe("combined");
  expect(state.lessonIds).toEqual(["1-2", "1-10"]);
  expect(state.placements.length).toBeGreaterThanOrEqual(4);
});
