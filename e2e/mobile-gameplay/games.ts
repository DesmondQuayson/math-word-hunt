import { expect, type Page } from "@playwright/test";

/**
 * Mobile gameplay fit — shared game drivers and the layout probe.
 *
 * Every game is driven into ACTIVE GAMEPLAY through its normal user interface
 * (no DOM surgery, no scrolling workaround), then measured with one probe so
 * the four games are judged by the same contract:
 *
 *   COMPACT HEADER · ACTIVE PROBLEM / STATUS · GAME BOARD · ESSENTIAL CONTROLS
 */

export type GameKey = "math-vocabulary-hunt" | "crosscalc" | "number-cross" | "number-logic";

export type GameProbe = Readonly<{
  /** Gameplay root: the element that must own the viewport while playing. */
  root: string;
  /** Header chrome above the play area (back link, brand, toolbars). */
  header: readonly string[];
  /** The active problem / target / status the learner must always see. */
  problem: readonly string[];
  /** The game board container. */
  board: string;
  /** Interactive board cells; the first and last match are the reachability corners. */
  cells: string;
  /** Essential controls needed to answer (primary action first). */
  controls: readonly string[];
  /** The Back to Games affordance. */
  back: string;
}>;

export const GAME_ROUTES: Readonly<Record<GameKey, string>> = Object.freeze({
  "math-vocabulary-hunt": "/game/runtime/index.html",
  "crosscalc": "/games/crosscalc/play",
  "number-cross": "/games/number-cross/play",
  "number-logic": "/games/number-logic/play"
});

export const GAME_LABELS: Readonly<Record<GameKey, string>> = Object.freeze({
  "math-vocabulary-hunt": "Math Vocabulary Hunt",
  "crosscalc": "CrossCalc",
  "number-cross": "Number Cross",
  "number-logic": "Number Logic"
});

export const PROBES: Readonly<Record<GameKey, GameProbe>> = Object.freeze({
  "math-vocabulary-hunt": {
    root: "#gameScreen",
    header: [".mathnexa-back-link", ".breadcrumb-bar", ".teacher-bar", ".scoreboard"],
    problem: ["#wordPanel .word-panel-header", "#timerBox"],
    board: "#letterGrid",
    cells: "#letterGrid .grid-cell",
    controls: ["#wordList .word-card"],
    back: ".mathnexa-back-link"
  },
  "crosscalc": {
    root: ".app-shell",
    header: [".native-back-link", ".topbar", ".puzzle-console"],
    problem: [".stage-heading", ".number-cell.selected"],
    board: ".board-scroll",
    cells: ".board .number-cell",
    controls: [".number-tray button", ".action-row button"],
    back: ".native-back-link"
  },
  "number-cross": {
    root: ".game-shell",
    header: [".site-header", ".game-topbar"],
    problem: [".board-instruction", ".puzzle-grid"],
    board: ".puzzle-grid",
    cells: ".puzzle-grid .number-cell",
    controls: [".game-tools .tool-button", ".new-puzzle-button"],
    back: ".native-back-link"
  },
  "number-logic": {
    root: "main[class*='_game_']",
    header: [".native-back-link", "header[class*='_header_']", "header[class*='_gameHeader_']"],
    problem: ["[class*='_targetChip_']"],
    board: "[class*='_board_']",
    cells: "main[class*='_game_'] section[class*='_boardPanel_'] button[class*='_position_'], main[class*='_game_'] section[class*='_boardPanel_'] [role='grid'] button",
    controls: ["[class*='_tray_'] button", "[class*='_controls_'] button"],
    back: ".native-back-link"
  }
});

/** A deterministic Math.random so every run draws the same puzzles (test-only; engines unchanged). */
export async function seedRandom(page: Page, seed = 20260917) {
  await page.addInitScript((initial) => {
    let state = initial >>> 0;
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

export type MvhLesson = Readonly<{ grade: "6" | "7" | "8"; topic: RegExp; lesson: RegExp; gridSize: number }>;

/** The corpus worst case: an 18 × 18 grid with nine terms in a dense word bank. */
export const MVH_WORST_CASE: MvhLesson = {
  grade: "7",
  topic: /Analyze and Use Proportional Relationships/,
  lesson: /Graph Proportional Relationships/,
  gridSize: 18
};

export async function openMathVocabularyHunt(page: Page, lesson: MvhLesson = MVH_WORST_CASE) {
  await page.goto(GAME_ROUTES["math-vocabulary-hunt"]);
  await page.locator(`.grade-card[data-grade="${lesson.grade}"]`).click();
  const topic = page.locator(".topic-card").filter({ hasText: lesson.topic }).first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await page.locator(".lesson-row").filter({ hasText: lesson.lesson }).first().click();
  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator("#letterGrid .grid-cell")).toHaveCount(lesson.gridSize * lesson.gridSize);
  await settle(page);
}

export type CrossCalcDifficulty = "beginner" | "easy" | "medium" | "hard" | "expert";

export async function openCrossCalc(page: Page, difficulty: CrossCalcDifficulty = "medium") {
  await page.goto(GAME_ROUTES.crosscalc);
  await expect(page.locator(".number-cell").first()).toBeVisible();
  if (difficulty !== "medium") {
    const setup = page.getByRole("button", { name: /^Puzzle Setup/i });
    await setup.click();
    await page.getByLabel("Difficulty").selectOption(difficulty);
    await setup.click();
    await expect(setup).toHaveAttribute("aria-expanded", "false");
  }
  await expect(page.locator(".number-tray button").first()).toBeVisible();
  await settle(page);
}

export type NumberCrossDifficulty = "beginner" | "easy" | "medium" | "hard" | "expert";

export async function openNumberCross(page: Page, difficulty: NumberCrossDifficulty = "easy") {
  await page.goto(GAME_ROUTES["number-cross"]);
  await page.locator(`.difficulty-chip[data-difficulty="${difficulty}"]`).click();
  await page.locator(".start-button").click();
  await dismissNumberCrossTutorial(page);
  await expect(page.locator(".puzzle-grid")).toBeVisible();
  await settle(page);
}

/**
 * First play opens the three-step tutorial. Skip it the way a learner would;
 * when Skip is unusable (covered at some phone sizes on the baseline), step
 * through it with its own primary button instead.
 */
export async function dismissNumberCrossTutorial(page: Page) {
  const layer = page.locator(".tutorial-layer");
  for (let step = 0; step < 6 && await layer.count(); step += 1) {
    const skip = layer.locator(".text-close");
    const skippable = await skip.click({ trial: true, timeout: 1_500 }).then(() => true, () => false);
    if (skippable) await skip.click();
    else await layer.locator(".tutorial-footer .primary-button").click();
  }
  await expect(layer).toHaveCount(0);
}

export const NUMBER_LOGIC_MODES = ["Lines of 3", "Square Sums", "Product Square", "Equal Sums", "U Sums", "Magic H"] as const;
export type NumberLogicMode = (typeof NUMBER_LOGIC_MODES)[number];

export async function openNumberLogic(page: Page, mode: NumberLogicMode = "Lines of 3") {
  await page.goto(GAME_ROUTES["number-logic"]);
  await page.locator("[class*='_modeList_'] > *").filter({ hasText: mode }).first().click();
  const skip = page.getByRole("button", { name: /Skip tutorial/i });
  await skip.or(page.locator("[class*='_difficultyCard_']").first()).first().waitFor();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.locator("[class*='_difficultyCard_']").first().click();
  await expect(page.locator("main[class*='_game_']")).toBeVisible();
  await expect(page.locator("[class*='_tray_'] button").first()).toBeAttached();
  await settle(page);
}

export async function openGame(page: Page, game: GameKey) {
  if (game === "math-vocabulary-hunt") return openMathVocabularyHunt(page);
  if (game === "crosscalc") return openCrossCalc(page);
  if (game === "number-cross") return openNumberCross(page);
  return openNumberLogic(page);
}

/** Two frames plus a short idle so ResizeObserver-driven sizing has landed. */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 120)))));
}

export type Box = Readonly<{ x: number; y: number; width: number; height: number; bottom: number; right: number }>;

export type LayoutReport = Readonly<{
  viewport: Readonly<{ width: number; height: number }>;
  /** Largest vertical scroll extent of the document, the body or any ancestor of the gameplay root. */
  pageScrollExtent: number;
  /** How far the page was already scrolled when gameplay started (focus-driven scrolling). */
  startScrollTop: number;
  pageScrollHeight: number;
  horizontalOverflow: number;
  headerHeight: number;
  controlsHeight: number;
  board: Box | null;
  boardContent: Box | null;
  problem: readonly (Box | null)[];
  controls: readonly (Box | null)[];
  firstCell: Box | null;
  lastCell: Box | null;
  back: Box | null;
  /** Element fully inside the viewport and not clipped by an ancestor, at scroll position zero. */
  problemVisible: boolean;
  boardVisible: boolean;
  firstCellVisible: boolean;
  lastCellVisible: boolean;
  controlsVisible: boolean;
  backVisible: boolean;
  /** Key points whose topmost hit-test target is some OTHER element (something covers them). */
  covered: readonly string[];
  /** Scroll containers inside the gameplay root that currently need scrolling. */
  internalScrollers: readonly string[];
  cellSize: number;
  gridFontSize: number;
}>;

/** Measure without scrolling anything: what the learner sees the moment gameplay starts. */
export function measureLayout(page: Page, probe: GameProbe): Promise<LayoutReport> {
  return page.evaluate((probe) => {
    const toBox = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10, bottom: Math.round(rect.bottom * 10) / 10, right: Math.round(rect.right * 10) / 10 };
    };
    const shown = (element: Element | null): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const first = (selector: string) => [...document.querySelectorAll(selector)].find(shown) ?? null;
    const describe = (element: Element) => {
      const classes = typeof (element as HTMLElement).className === "string" ? (element as HTMLElement).className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${classes ? `.${classes}` : ""}`;
    };
    const scrollable = (element: Element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll|overlay)/.test(style.overflowY) || /(auto|scroll|overlay)/.test(style.overflowX);
    };
    /** Visible = inside the viewport and inside every clipping ancestor, with nothing scrolled. */
    const fullyVisible = (element: Element | null, tolerance = 1) => {
      if (!shown(element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.top < -tolerance || rect.left < -tolerance || rect.bottom > innerHeight + tolerance || rect.right > innerWidth + tolerance) return false;
      for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const box = parent.getBoundingClientRect();
        const top = box.top + parent.clientTop;
        const left = box.left + parent.clientLeft;
        if (rect.top < top - tolerance || rect.left < left - tolerance || rect.bottom > top + parent.clientHeight + tolerance || rect.right > left + parent.clientWidth + tolerance) return false;
      }
      return true;
    };
    /** The part of an element not clipped by the viewport or by any scrolling/clipping ancestor. */
    const visibleRect = (element: Element) => {
      const rect = element.getBoundingClientRect();
      let top = Math.max(rect.top, 0);
      let left = Math.max(rect.left, 0);
      let bottom = Math.min(rect.bottom, innerHeight);
      let right = Math.min(rect.right, innerWidth);
      for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const box = parent.getBoundingClientRect();
        top = Math.max(top, box.top + parent.clientTop);
        left = Math.max(left, box.left + parent.clientLeft);
        bottom = Math.min(bottom, box.top + parent.clientTop + parent.clientHeight);
        right = Math.min(right, box.left + parent.clientLeft + parent.clientWidth);
      }
      return { top, left, bottom, right };
    };
    /** Something ELSE is on top of the visible part of this element (an overlay, a sticky bar). */
    const coveredAt = (element: Element | null, label: string, out: string[]) => {
      if (!shown(element)) return;
      const rect = visibleRect(element);
      if (rect.bottom - rect.top < 2 || rect.right - rect.left < 2) return;
      const points = [[(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2]];
      for (const [x, y] of points) {
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== element && !element.contains(hit) && !hit.contains(element)) out.push(`${label} covered by ${describe(hit)}`);
      }
    };

    const root = first(probe.root);
    const board = first(probe.board);
    const cells = [...document.querySelectorAll(probe.cells)].filter(shown);
    const firstCell = cells[0] ?? null;
    const lastCell = cells.at(-1) ?? null;
    const back = first(probe.back);
    const problems = probe.problem.map(first);
    const controls = probe.controls.map(first);
    const headers = probe.header.map(first).filter(shown).filter((element) => getComputedStyle(element).position !== "fixed");

    // Page-level scrolling: the document, the body, and the gameplay root with every ancestor.
    const pageScrollers = new Set<Element>([document.scrollingElement ?? document.documentElement, document.body]);
    for (let element: Element | null = root; element; element = element.parentElement) pageScrollers.add(element);
    let pageScrollExtent = 0;
    let pageScrollHeight = innerHeight;
    let startScrollTop = 0;
    for (const element of pageScrollers) {
      startScrollTop = Math.max(startScrollTop, element.scrollTop);
      const isDocument = element === document.scrollingElement || element === document.documentElement;
      if (!isDocument && !scrollable(element)) continue;
      const extent = element.scrollHeight - element.clientHeight;
      if (extent > pageScrollExtent) {
        pageScrollExtent = extent;
        pageScrollHeight = element.scrollHeight;
      }
    }
    const scroller = document.scrollingElement ?? document.documentElement;
    const horizontalOverflow = Math.max(scroller.scrollWidth - scroller.clientWidth, document.body.scrollWidth - document.body.clientWidth, 0);

    const internalScrollers: string[] = [];
    if (root) {
      for (const element of root.querySelectorAll("*")) {
        if (!shown(element) || !scrollable(element)) continue;
        const style = getComputedStyle(element);
        const needsY = /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
        const needsX = /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
        if (needsY || needsX) internalScrollers.push(`${describe(element)}${needsX ? " x" : ""}${needsY ? " y" : ""}`);
      }
    }

    const covered: string[] = [];
    coveredAt(board, "board", covered);
    coveredAt(firstCell, "first cell", covered);
    coveredAt(lastCell, "last cell", covered);
    problems.forEach((element, index) => coveredAt(element, `problem ${index + 1}`, covered));
    controls.forEach((element, index) => coveredAt(element, `control ${index + 1}`, covered));
    coveredAt(back, "back", covered);

    const union = (elements: readonly (Element | null)[]) => {
      const rects = elements.filter(shown).map((element) => element.getBoundingClientRect());
      if (!rects.length) return 0;
      return Math.round(Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top)));
    };
    const cellRect = firstCell?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageScrollExtent: Math.max(0, Math.round(pageScrollExtent)),
      startScrollTop: Math.round(startScrollTop),
      pageScrollHeight: Math.round(pageScrollHeight),
      horizontalOverflow: Math.round(horizontalOverflow),
      headerHeight: union(headers),
      controlsHeight: union(controls),
      board: toBox(board),
      boardContent: toBox(board?.firstElementChild ?? null),
      problem: problems.map(toBox),
      controls: controls.map(toBox),
      firstCell: toBox(firstCell),
      lastCell: toBox(lastCell),
      back: toBox(back),
      problemVisible: problems.every((element) => element === null || fullyVisible(element)) && problems.some((element) => element !== null),
      boardVisible: fullyVisible(board),
      firstCellVisible: fullyVisible(firstCell),
      lastCellVisible: fullyVisible(lastCell),
      controlsVisible: controls.every((element) => element === null || fullyVisible(element)) && controls.some((element) => element !== null),
      backVisible: fullyVisible(back),
      covered,
      internalScrollers,
      cellSize: cellRect ? Math.round(Math.min(cellRect.width, cellRect.height) * 10) / 10 : 0,
      gridFontSize: firstCell ? Number.parseFloat(getComputedStyle(firstCell).fontSize) : 0
    };
  }, probe);
}
