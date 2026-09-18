import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { generatePuzzle } from "../../apps/platform-web/features/games/crosscalc-v2/core/generator";
import {
  GAME_LABELS,
  NUMBER_LOGIC_MODES,
  PROBES,
  measureLayout,
  openCrossCalc,
  openGame,
  openMathVocabularyHunt,
  openNumberCross,
  openNumberLogic,
  seedRandom,
  settle,
  type GameKey,
  type LayoutReport
} from "./games";

/**
 * MOBILE GAMEPLAY CONTRACT — the gate.
 *
 * For every game, at every normal phone size, in every engine:
 *   - the page never scrolls (no precision scrolling to reach the game),
 *   - nothing scrolls sideways,
 *   - the header's Back to Games, the active problem, the board and the
 *     essential controls are on screen together, and nothing covers them.
 * Boards whose content is genuinely taller than a phone (CrossCalc Medium and
 * above) use ONE bounded board region that scrolls on its own; the problem,
 * the tray and the actions stay put. The word bank is Math Vocabulary Hunt's
 * one such region on short phones.
 *
 * Every interaction below is a real tap, drag, key press or wheel — no test
 * ever scrolls the page, and each play test asserts that the page did not.
 */

const NORMAL_PHONES = [
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 }
] as const;

const SMALL_PHONES = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  // iPhone 13 in Safari with its browser bars showing.
  { width: 390, height: 664 }
] as const;

const OTHER = [
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
] as const;

const GAMES: readonly GameKey[] = ["math-vocabulary-hunt", "crosscalc", "number-cross", "number-logic"];

/** The ONE internal region each game may scroll (plus sideways number trays). */
const ALLOWED_SCROLLERS: Readonly<Record<GameKey, RegExp>> = {
  "math-vocabulary-hunt": /^ol#wordList\b/,
  "crosscalc": /^(div#puzzle-board\.board-scroll|div\.number-tray x$)/,
  "number-cross": /^$/,
  "number-logic": /^(aside\._proofPanel_1annj_1|div\._busShell_1ozdl_1|div x$)/
};

function expectPlayable(report: LayoutReport, game: GameKey, label: string) {
  expect(report.pageScrollExtent, `${label}: the page itself must not scroll`).toBeLessThanOrEqual(1);
  expect(report.startScrollTop, `${label}: gameplay must not open pre-scrolled`).toBe(0);
  expect(report.horizontalOverflow, `${label}: no sideways page scroll`).toBeLessThanOrEqual(1);
  expect(report.backVisible, `${label}: Back to Games visible`).toBe(true);
  expect(report.problemVisible, `${label}: active problem / status visible`).toBe(true);
  expect(report.boardVisible, `${label}: board region fully on screen`).toBe(true);
  expect(report.covered, `${label}: nothing covers the problem, board or controls`).toEqual([]);
  for (const scroller of report.internalScrollers) {
    expect(scroller, `${label}: only the intended game region may scroll`).toMatch(ALLOWED_SCROLLERS[game]);
  }
}

/** Every word-bank term is on screen, or reachable by scrolling the word bank itself. */
async function everyTermReachable(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>("#wordList")!;
    const last = [...list.querySelectorAll<HTMLElement>(".word-card")].at(-1)!.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    return last.bottom <= Math.min(box.bottom, innerHeight) + 1 || list.scrollHeight > list.clientHeight + 1;
  });
}

async function pageScrollOffset(page: Page) {
  return page.evaluate(() => Math.max(
    document.scrollingElement?.scrollTop ?? 0,
    document.body.scrollTop,
    document.documentElement.scrollTop,
    document.scrollingElement?.scrollLeft ?? 0
  ));
}

test.describe("mobile gameplay contract", () => {
  test.beforeEach(async ({ page }) => {
    await seedRandom(page);
  });

  for (const game of GAMES) {
    test(`${GAME_LABELS[game]}: normal phones — no page scrolling, everything essential on screen`, async ({ page }) => {
      for (const viewport of NORMAL_PHONES) {
        await page.setViewportSize(viewport);
        await openGame(page, game);
        const report = await measureLayout(page, PROBES[game]);
        const label = `${viewport.width}×${viewport.height}`;
        expectPlayable(report, game, label);
        expect(report.controlsVisible, `${label}: essential controls visible`).toBe(true);
        if (game === "math-vocabulary-hunt") expect(await everyTermReachable(page), `${label}: every term reachable`).toBe(true);
        if (game !== "crosscalc") {
          expect(report.firstCellVisible && report.lastCellVisible, `${label}: first and last board cells on screen`).toBe(true);
        }
      }
    });

    test(`${GAME_LABELS[game]}: small phones and Safari with browser bars — still no page scrolling`, async ({ page }) => {
      for (const viewport of SMALL_PHONES) {
        await page.setViewportSize(viewport);
        await openGame(page, game);
        const report = await measureLayout(page, PROBES[game]);
        const label = `${viewport.width}×${viewport.height}`;
        expectPlayable(report, game, label);
        if (game !== "crosscalc") {
          expect(report.firstCellVisible && report.lastCellVisible, `${label}: first and last board cells on screen`).toBe(true);
        }
        expect(report.controlsVisible, `${label}: essential controls visible`).toBe(true);
        if (game === "math-vocabulary-hunt") expect(await everyTermReachable(page), `${label}: every term reachable`).toBe(true);
      }
    });

    test(`${GAME_LABELS[game]}: tablet, landscape phones, desktop and Smart Board`, async ({ page }) => {
      for (const viewport of OTHER) {
        await page.setViewportSize(viewport);
        await openGame(page, game);
        const report = await measureLayout(page, PROBES[game]);
        const label = `${viewport.width}×${viewport.height}`;
        expectPlayable(report, game, label);
        expect(report.controlsVisible, `${label}: essential controls visible`).toBe(true);
        if (game !== "crosscalc") {
          expect(report.firstCellVisible && report.lastCellVisible, `${label}: first and last board cells on screen`).toBe(true);
        }
      }
    });

    test(`${GAME_LABELS[game]}: portrait → landscape → portrait recalculates without a refresh`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openGame(page, game);
      for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await settle(page);
        const report = await measureLayout(page, PROBES[game]);
        const label = `rotated to ${viewport.width}×${viewport.height}`;
        expectPlayable(report, game, label);
        expect(report.controlsVisible, `${label}: essential controls visible`).toBe(true);
        if (game !== "crosscalc") expect(report.firstCellVisible && report.lastCellVisible, `${label}: board corners`).toBe(true);
      }
    });

    test(`${GAME_LABELS[game]}: enlarged text (20 px root) keeps the game on one screen`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = "html { font-size: 20px !important; }";
          document.head.append(style);
        });
      });
      await openGame(page, game);
      const report = await measureLayout(page, PROBES[game]);
      expect(report.pageScrollExtent, "the page itself must not scroll").toBeLessThanOrEqual(1);
      expect(report.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(report.backVisible).toBe(true);
      expect(report.problemVisible).toBe(true);
      expect(report.boardVisible).toBe(true);
      expect(report.covered).toEqual([]);
    });
  }

  test("Math Vocabulary Hunt: every lesson grid size fits a 390 × 844 phone with its first and last cells on screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const lessons = [
      { grade: "7", topic: /Analyze and Use Proportional Relationships/, lesson: /Graph Proportional Relationships/, gridSize: 18 },
      { grade: "6", topic: /Use Positive Rational Numbers/, lesson: /Fluently Add, Subtract, and Multiply Decimals/, gridSize: 0 }
    ] as const;
    for (const lesson of lessons) {
      await page.goto("/game/runtime/index.html");
      await page.locator(`.grade-card[data-grade="${lesson.grade}"]`).click();
      const topic = page.locator(".topic-card").filter({ hasText: lesson.topic }).first();
      await topic.locator("summary").click();
      await topic.locator(".choose-topic-button").click();
      await page.locator(".lesson-row").filter({ hasText: lesson.lesson }).first().click();
      await expect(page.locator("#letterGrid .grid-cell").first()).toBeVisible();
      await settle(page);
      const report = await measureLayout(page, PROBES["math-vocabulary-hunt"]);
      expectPlayable(report, "math-vocabulary-hunt", `grade ${lesson.grade}`);
      expect(report.firstCellVisible && report.lastCellVisible).toBe(true);
      // Readable, not microscopic: cells stay above 17 px and letters above 11 px on a 390 px phone.
      expect(report.cellSize).toBeGreaterThanOrEqual(17);
      expect(report.gridFontSize).toBeGreaterThanOrEqual(11);
    }
  });

  test("Math Vocabulary Hunt: the word bank never breaks a term mid-word on phones", async ({ page }) => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await openMathVocabularyHunt(page);
      const broken = await page.evaluate(() => {
        const out: string[] = [];
        for (const term of document.querySelectorAll<HTMLElement>(".word-card .term-display")) {
          const walker = document.createTreeWalker(term, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const text = node.textContent ?? "";
            let offset = 0;
            for (const piece of text.split(/(\s+)/)) {
              if (piece.trim()) {
                const range = document.createRange();
                range.setStart(node, offset);
                range.setEnd(node, offset + piece.length);
                const tops = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
                if (tops.size > 1) out.push(piece);
              }
              offset += piece.length;
            }
          }
        }
        return out;
      });
      expect(broken, `${viewport.width}×${viewport.height}`).toEqual([]);
    }
  });

  test("Math Vocabulary Hunt: the phone header is one compact row and the Controls menu opens over the game", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMathVocabularyHunt(page);
    const header = await page.locator(".breadcrumb-bar").boundingBox();
    expect(header!.height).toBeLessThanOrEqual(56);
    await expect(page.locator(".mathnexa-back-link")).toHaveAccessibleName("Back to Games");
    await expect(page.locator(".mathnexa-back-link")).toHaveText(/Games/);
    await expect(page.locator("#timerValue")).toBeVisible();
    const toggle = page.getByRole("button", { name: "Controls" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#revealButton")).toBeHidden();
    const boardBefore = await page.locator("#letterGrid").boundingBox();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const id of ["#newPuzzleButton", "#modeButton", "#revealButton", "#timerButton", "#soundButton", "#musicButton", "#resetScoresButton", "#fullscreenButton", "#backLessonsButton"]) {
      await expect(page.locator(id)).toBeVisible();
    }
    await expect(page.locator(".teacher-bar .mathnexa-music-credit summary")).toBeVisible();
    // An overlay: the board has not moved underneath it.
    expect(await page.locator("#letterGrid").boundingBox()).toEqual(boardBefore);
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    // An action closes the menu; a switch keeps it open.
    await toggle.click();
    await page.locator("#timerButton").click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.locator("#timerButton").click();
    await page.locator("#revealButton").click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await pageScrollOffset(page)).toBe(0);
  });

  test("Math Vocabulary Hunt: desktop and Smart Board keep the full teacher bar; Back no longer covers the brand", async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewport);
      await openMathVocabularyHunt(page);
      await expect(page.getByRole("button", { name: "Controls" })).toBeHidden();
      await expect(page.locator("#revealButton")).toBeVisible();
      await expect(page.locator("#backLessonsButton")).toBeVisible();
      await expect(page.locator(".teacher-bar .mathnexa-music-credit summary")).toBeVisible();
      const [back, brand] = await Promise.all([page.locator(".mathnexa-back-link").boundingBox(), page.locator("#brandButton").boundingBox()]);
      expect(back!.x + back!.width, `${viewport.width}: the Back link ends before the brand starts`).toBeLessThanOrEqual(brand!.x + 1);
      const teacherBar = await page.locator(".teacher-bar").evaluate((bar) => ({ scroll: bar.scrollWidth - bar.clientWidth }));
      expect(teacherBar.scroll, `${viewport.width}: every teacher control fits its bar`).toBeLessThanOrEqual(1);
    }
  });

  test("CrossCalc: the equation being solved stays on screen above the board while the board scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCrossCalc(page, "expert");
    const line = page.locator(".compact-active-equation");
    await expect(line).toContainText("Tap an empty ? cell");
    const board = page.locator("#puzzle-board");
    const lastEmpty = page.locator(".number-cell.empty").last();
    await lastEmpty.click();
    await expect(line).not.toContainText("Tap an empty");
    const equation = (await line.locator(".compact-active-equation__item").first().textContent()) ?? "";
    expect(equation).toMatch(/=/);
    expect(await board.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await pageScrollOffset(page)).toBe(0);
    const [lineBox, boardBox, trayBox, actionsBox] = await Promise.all([
      line.boundingBox(), board.boundingBox(), page.locator(".tray-shell").boundingBox(), page.locator(".action-row").boundingBox()
    ]);
    expect(lineBox!.y).toBeGreaterThanOrEqual(0);
    expect(lineBox!.y + lineBox!.height).toBeLessThanOrEqual(boardBox!.y + 1);
    expect(boardBox!.y + boardBox!.height).toBeLessThanOrEqual(trayBox!.y + 1);
    expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(844);
  });

  test("CrossCalc: a 7-column network fits a 320 px phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openCrossCalc(page, "hard");
    const scroll = await page.locator("#puzzle-board").evaluate((element) => ({ sideways: element.scrollWidth - element.clientWidth }));
    expect(scroll.sideways).toBeLessThanOrEqual(1);
    const smallest = await page.locator(".number-cell").evaluateAll((cells) => Math.min(...cells.map((cell) => Math.min(cell.getBoundingClientRect().width, cell.getBoundingClientRect().height))));
    expect(smallest).toBeGreaterThanOrEqual(44);
  });

  test("CrossCalc: a Medium network fits the 1440 × 900 desktop and the Smart Board whole", async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await openCrossCalc(page);
      const board = await page.locator("#puzzle-board").evaluate((element) => ({ vertical: element.scrollHeight - element.clientHeight, sideways: element.scrollWidth - element.clientWidth }));
      expect(board.vertical, `${viewport.width}`).toBeLessThanOrEqual(1);
      expect(board.sideways, `${viewport.width}`).toBeLessThanOrEqual(1);
    }
  });

  test("Number Logic: every puzzle mode keeps its target, board, tray and controls on a 390 × 844 phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of NUMBER_LOGIC_MODES) {
      await openNumberLogic(page, mode);
      const report = await measureLayout(page, { ...PROBES["number-logic"], board: mode === "Product Square" ? "._busShell_1ozdl_1" : PROBES["number-logic"].board });
      expectPlayable(report, "number-logic", mode);
      expect(report.controlsVisible, `${mode}: tray and controls visible`).toBe(true);
      const chip = await page.locator("._targetChip_1annj_1").evaluate((element) => ({ overflow: element.scrollWidth - element.clientWidth }));
      expect(chip.overflow, `${mode}: the target never spills out of its chip`).toBeLessThanOrEqual(1);
    }
  });

  test("Number Cross: the tutorial's Skip is a real, uncovered 44 px control at every size", async ({ page, isMobile }) => {
    // Phone projects cover phones; the desktop projects cover the desktop size.
    const viewports = isMobile ? [{ width: 320, height: 568 }, { width: 390, height: 844 }] : [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/games/number-cross/play");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.locator(".start-button").click();
      const skip = page.locator(".tutorial-layer .text-close");
      await expect(skip).toBeVisible();
      await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
      const box = await skip.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      await skip.click({ timeout: 5_000 });
      await expect(page.locator(".tutorial-layer")).toHaveCount(0);
    }
  });
});

test.describe("real play on a phone (touch)", () => {
  test.beforeEach(async ({ page }) => {
    await seedRandom(page);
  });

  test("Math Vocabulary Hunt: find a word that runs through the bottom rows by tapping its ends", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "touch projects only");
    await page.setViewportSize({ width: 390, height: 844 });
    await openMathVocabularyHunt(page);
    const target = await page.evaluate(() => {
      const state = (window as unknown as { __MATH_WORD_HUNT__: { getState(): { gridSize: number; placements: { key: string; cells: { row: number; col: number }[] }[] } } }).__MATH_WORD_HUNT__.getState();
      const ranked = [...state.placements].sort((a, b) => Math.max(...b.cells.map((cell) => cell.row)) - Math.max(...a.cells.map((cell) => cell.row)));
      return { gridSize: state.gridSize, placement: ranked[0]! };
    });
    const bottomRow = Math.max(...target.placement.cells.map((cell) => cell.row));
    expect(bottomRow, "the chosen word reaches the lower rows").toBeGreaterThanOrEqual(target.gridSize - 4);
    await page.locator(`.word-card[data-term-key="${target.placement.key.replaceAll('"', '\\"')}"]`).tap();
    const first = target.placement.cells[0]!;
    const last = target.placement.cells.at(-1)!;
    await page.locator(`.grid-cell[data-row="${first.row}"][data-col="${first.col}"]`).tap();
    await page.locator(`.grid-cell[data-row="${last.row}"][data-col="${last.col}"]`).tap();
    await expect(page.locator("#findLayer")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __MATH_WORD_HUNT__: { getState(): { found: string[] } } }).__MATH_WORD_HUNT__.getState().found)).toContain(target.placement.key);
    expect(await pageScrollOffset(page)).toBe(0);
    await page.locator("#gotItButton").tap();
    await expect(page.locator("#findLayer")).toBeHidden();
  });

  test("Math Vocabulary Hunt: a touch DRAG across the last row selects without scrolling the page", async ({ page, browserName, hasTouch }) => {
    test.skip(browserName !== "chromium" || !hasTouch, "touch-drag dispatch needs Chromium's input domain");
    await page.setViewportSize({ width: 390, height: 844 });
    await openMathVocabularyHunt(page);
    const target = await page.evaluate(() => {
      const state = (window as unknown as { __MATH_WORD_HUNT__: { getState(): { placements: { key: string; cells: { row: number; col: number }[] }[] } } }).__MATH_WORD_HUNT__.getState();
      return [...state.placements].sort((a, b) => Math.max(...b.cells.map((cell) => cell.row)) - Math.max(...a.cells.map((cell) => cell.row)))[0]!;
    });
    await page.locator(`.word-card[data-term-key="${target.key.replaceAll('"', '\\"')}"]`).tap();
    const centre = async (row: number, col: number) => {
      const box = (await page.locator(`.grid-cell[data-row="${row}"][data-col="${col}"]`).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const path = await Promise.all(target.cells.map((cell) => centre(cell.row, cell.col)));
    const session = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: { x: number; y: number }) => session.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
    await touch("touchStart", path[0]);
    for (const point of path.slice(1)) await touch("touchMove", point);
    await touch("touchEnd");
    await expect(page.locator("#findLayer")).toBeVisible();
    expect(await pageScrollOffset(page)).toBe(0);
  });

  test("CrossCalc: solve a whole network on a phone by tapping cells and tiles", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "touch projects only");
    await page.setViewportSize({ width: 390, height: 844 });
    await openCrossCalc(page, "easy");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa.crosscalc.v2.active") ?? "null"));
    const puzzle = generatePuzzle(stored.puzzle.mode, stored.puzzle.difficulty, stored.puzzle.seed);
    const blanks = puzzle.cells.filter((cell) => !cell.given);
    expect(blanks.length).toBeGreaterThan(3);
    for (const cell of blanks) {
      const index = await page.locator(".board .number-cell").evaluateAll((cells, at) => cells.findIndex((element) => {
        const style = getComputedStyle(element);
        return Number.parseInt(style.gridRowStart, 10) === at.row && Number.parseInt(style.gridColumnStart, 10) === at.col;
      }), { row: cell.row + 1, col: cell.col + 1 });
      expect(index, `cell ${cell.id} is on the board`).toBeGreaterThanOrEqual(0);
      const target = page.locator(".board .number-cell").nth(index);
      await target.tap();
      await expect(page.locator(".compact-active-equation")).not.toContainText("Tap an empty");
      const tile = page.locator(".number-tray button", { hasText: new RegExp(`^${cell.solution}$`) }).first();
      await tile.tap();
      // Intersection cells carry a ◆ marker after their value.
      await expect(target).toHaveText(new RegExp(`^${cell.solution}\\s*◆?$`));
      expect(await pageScrollOffset(page), "the page never scrolls while playing").toBe(0);
    }
    // The last correct tile completes the network on its own.
    const completion = page.getByRole("dialog", { name: "Network complete." });
    await expect(completion).toBeVisible();
    const heading = await page.getByRole("heading", { name: "Network complete." }).boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(0);
    expect(heading!.y + heading!.height).toBeLessThanOrEqual(844);
    expect(await pageScrollOffset(page)).toBe(0);
  });

  test("Number Cross: cross out tiles in the first and last rows by tapping", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "touch projects only");
    await page.setViewportSize({ width: 390, height: 844 });
    await openNumberCross(page, "hard");
    const cells = page.locator(".puzzle-grid .number-cell");
    for (const cell of [cells.first(), cells.last()]) {
      await cell.tap();
      await expect(cell).toHaveAttribute("aria-pressed", "true");
    }
    await page.locator(".tool-button", { hasText: "Undo" }).tap();
    await expect(cells.last()).toHaveAttribute("aria-pressed", "false");
    expect(await pageScrollOffset(page)).toBe(0);
  });

  test("Number Logic: place a tile from the tray on the board and undo it", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "touch projects only");
    await page.setViewportSize({ width: 390, height: 844 });
    await openNumberLogic(page);
    const tile = page.locator("._tray_1annj_1 button").first();
    const value = ((await tile.textContent()) ?? "").trim();
    const empty = page.locator("._board_1annj_1 button[aria-label$=': empty']").last();
    const position = (await empty.getAttribute("data-position-id"))!;
    await tile.tap();
    await empty.tap();
    await expect(page.locator(`._board_1annj_1 button[data-position-id="${position}"]`)).toHaveAttribute("aria-label", new RegExp(`${value}`));
    await page.getByRole("button", { name: "Undo" }).tap();
    await expect(page.locator(`._board_1annj_1 button[data-position-id="${position}"]`)).toHaveAttribute("aria-label", /empty/);
    expect(await pageScrollOffset(page)).toBe(0);
  });
});

/**
 * Findings that exist in the released game markup BEFORE this phase and are
 * not touched by it (the Number Cross board's grid roles, and white numbers on
 * the teal "line solved" badge). They are listed — never silently disabled —
 * and reported in docs/mobile-gameplay-fit-v1.md; anything else fails.
 */
const PRE_EXISTING: Readonly<Partial<Record<GameKey, readonly { rule: string; target: RegExp }[]>>> = {
  "number-cross": [
    { rule: "aria-allowed-attr", target: /^button\[data-index="\d+"\]$/ },
    { rule: "aria-required-parent", target: /^button\[data-index="\d+"\]$/ },
    { rule: "aria-required-children", target: /^\.puzzle-grid$/ },
    { rule: "color-contrast", target: /\.correct\b.*\.target-value$/ }
  ]
};

test.describe("accessibility of the phone layouts", () => {
  const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");

  for (const game of GAMES) {
    test(`${GAME_LABELS[game]}: axe WCAG 2.1 AA and focus stays visible without page scrolling`, async ({ page, browserName }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openGame(page, game);
      await page.evaluate(axeSource);
      const result = await page.evaluate(async (engine) => (window as unknown as {
        axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> };
      }).axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        // Playwright WebKit cannot run axe's text-measurement canvas; Chromium is the contrast gate.
        rules: { "color-contrast": { enabled: engine !== "webkit" } }
      }), browserName);
      const known = PRE_EXISTING[game] ?? [];
      const unexpected = result.violations.flatMap((violation) => violation.nodes
        .map((node) => node.target.join(" "))
        .filter((target) => !known.some((item) => item.rule === violation.id && item.target.test(target)))
        .map((target) => `${violation.id}: ${target}`));
      expect(unexpected).toEqual([]);

      // Keyboard: the first dozen stops are real, visible controls, and tabbing never scrolls the page.
      await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => undefined);
      for (let stop = 0; stop < 12; stop += 1) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return null;
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, visible: rect.width > 0 && rect.height > 0 };
        });
        if (!focused) continue;
        if (focused.visible) {
          expect(focused.top, `${focused.tag} focus inside the viewport`).toBeGreaterThanOrEqual(-1);
          expect(focused.bottom, `${focused.tag} focus inside the viewport`).toBeLessThanOrEqual(844 + 1);
        }
        expect(await pageScrollOffset(page)).toBe(0);
      }
    });
  }
});

test.describe("visual regression — phone gameplay", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !isMobile, "baselines are recorded on the Chromium touch phone project");

  const SHOTS: readonly { game: GameKey; viewport: { width: number; height: number } }[] = [
    { game: "math-vocabulary-hunt", viewport: { width: 390, height: 844 } },
    { game: "math-vocabulary-hunt", viewport: { width: 320, height: 568 } },
    { game: "math-vocabulary-hunt", viewport: { width: 844, height: 390 } },
    { game: "crosscalc", viewport: { width: 390, height: 844 } },
    { game: "crosscalc", viewport: { width: 320, height: 568 } },
    { game: "crosscalc", viewport: { width: 844, height: 390 } },
    { game: "number-cross", viewport: { width: 390, height: 844 } },
    { game: "number-cross", viewport: { width: 844, height: 390 } },
    { game: "number-logic", viewport: { width: 390, height: 844 } },
    { game: "number-logic", viewport: { width: 844, height: 390 } }
  ];

  for (const shot of SHOTS) {
    test(`${GAME_LABELS[shot.game]} ${shot.viewport.width}×${shot.viewport.height}`, async ({ page }) => {
      await seedRandom(page);
      await page.setViewportSize(shot.viewport);
      await openGame(page, shot.game);
      await expect(page).toHaveScreenshot(`${shot.game}-${shot.viewport.width}x${shot.viewport.height}.png`, {
        mask: [page.locator("#timerValue, #timer-live, ._clock_1annj_1 strong, .status-cluster strong")]
      });
    });
  }
});

