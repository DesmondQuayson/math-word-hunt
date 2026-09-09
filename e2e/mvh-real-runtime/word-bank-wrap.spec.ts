import { expect, test, type Page } from "@playwright/test";

/**
 * BS-01 — Math Vocabulary Hunt word-bank terms must never break in the middle
 * of a word.
 *
 * The document under test is the one the shipped enhancer produces, served at
 * the real route path under the real route CSP (scripts/run-mvh-real-runtime-e2e.mjs),
 * so the canonical stylesheet AND the enhancer stylesheet are both in effect —
 * exactly what a learner's browser receives.
 *
 * Every assertion reads layout, not pixels: each word inside every
 * `.term-display` is wrapped in a Range and must produce line boxes on ONE line.
 * A term made of several words may wrap between those words.
 *
 * The lessons are the two DENSE (two-column) lessons with the longest placeable
 * words in the corpus: Grade 6 lesson 1-1 (ten terms, "Difference") and
 * Grade 7 lesson 2-5 (nine terms, "Proportionality", the widest word in any
 * dense lesson at 240 px). The boundary viewports are the canonical layout
 * breakpoints: 901 px (first width above the stacked phone layout), 1024 px
 * (iPad landscape), 1180 px (last width of the 430 px side panel, iPad Air /
 * iPad 10 landscape), 1194 px (iPad Pro 11" landscape), 1279 px (last width of
 * the single-column window) and 1280 px (first width at which a two-column
 * card, 328 px, holds every dense term — the canonical two-column layout must
 * be back and still hold every word).
 */

type WrapReport = Readonly<{
  cards: number;
  columns: number;
  brokenTerms: readonly string[];
  overflowWrap: string;
  cardWidth: number;
  documentOverflowX: boolean;
  listScrollable: boolean;
  lastCardReachable: boolean;
}>;

const LESSONS = [
  { label: "Grade 6 · 1-1 Fluently Add, Subtract, and Multiply Decimals", grade: "6", topic: /Use Positive Rational Numbers/, lesson: /Fluently Add, Subtract, and Multiply Decimals/ },
  { label: "Grade 7 · 2-5 Graph Proportional Relationships", grade: "7", topic: /Analyze and Use Proportional Relationships/, lesson: /Graph Proportional Relationships/ }
] as const;

const SINGLE_COLUMN_WINDOW = [
  { width: 901, height: 768 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1194, height: 834 },
  { width: 1279, height: 800 }
] as const;

const TWO_COLUMN_CONTROL = { width: 1280, height: 720 } as const;

async function openLesson(page: Page, lesson: (typeof LESSONS)[number]) {
  await page.goto("/game/runtime/index.html");
  await page.locator(`.grade-card[data-grade="${lesson.grade}"]`).click();
  const topic = page.locator(".topic-card").filter({ hasText: lesson.topic }).first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await page.locator(".lesson-row").filter({ hasText: lesson.lesson }).first().click();
  await expect(page.locator("#letterGrid .grid-cell").first()).toBeVisible();
  await expect(page.locator(".word-list.dense")).toHaveCount(1);
  await expect(page.locator(".word-card")).toHaveCount(lesson.grade === "6" ? 10 : 9);
}

/** Layout truth for every word-bank term: which words occupy more than one line box. */
function reportWrap(page: Page): Promise<WrapReport> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>(".word-list");
    if (!list) throw new Error("word list missing");
    const cards = [...document.querySelectorAll<HTMLElement>(".word-card")];
    const brokenTerms: string[] = [];
    let overflowWrap = "";
    for (const card of cards) {
      const term = card.querySelector<HTMLElement>(".term-display");
      if (!term) continue;
      overflowWrap = getComputedStyle(term).overflowWrap;
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
            if (tops.size > 1) brokenTerms.push(`${term.textContent?.trim()} -> ${piece}`);
          }
          offset += piece.length;
        }
      }
    }
    const rects = cards.map((card) => card.getBoundingClientRect());
    const listRect = list.getBoundingClientRect();
    return {
      cards: cards.length,
      columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
      brokenTerms,
      overflowWrap,
      cardWidth: Math.round(rects[0]?.width ?? 0),
      documentOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      listScrollable: list.scrollHeight > list.clientHeight + 1,
      lastCardReachable: rects.length > 0 && (rects[rects.length - 1].bottom <= listRect.bottom + 1 || list.scrollHeight > list.clientHeight + 1)
    };
  });
}

test.describe("math vocabulary hunt word bank never breaks a term mid-word", () => {
  for (const lesson of LESSONS) {
    for (const viewport of SINGLE_COLUMN_WINDOW) {
      test(`${lesson.label} at ${viewport.width}x${viewport.height} uses one column and keeps every word whole`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openLesson(page, lesson);
        const report = await reportWrap(page);
        expect(report.brokenTerms, "no term may split between arbitrary characters").toEqual([]);
        expect(report.overflowWrap, "wrapping is limited to word boundaries in the window").toBe("normal");
        expect(report.columns, "the dense list is single-column while the panel cannot hold two cards").toBe(1);
        expect(report.cardWidth).toBeGreaterThanOrEqual(400);
        expect(report.documentOverflowX, "no page-level horizontal scroll").toBe(false);
        expect(report.lastCardReachable, "every card stays reachable (in view or by scrolling the list)").toBe(true);
      });
    }

    test(`${lesson.label} at ${TWO_COLUMN_CONTROL.width}x${TWO_COLUMN_CONTROL.height} is back on the canonical two columns and still keeps every word whole`, async ({ page }) => {
      await page.setViewportSize(TWO_COLUMN_CONTROL);
      await openLesson(page, lesson);
      const report = await reportWrap(page);
      expect(report.brokenTerms).toEqual([]);
      expect(report.columns, "the canonical two-column layout is untouched from 1280 px").toBe(2);
      expect(report.cardWidth).toBeGreaterThanOrEqual(312);
      expect(report.documentOverflowX).toBe(false);
    });
  }

  test("the fix stays inside the enhancer stylesheet: the canonical document still declares overflow-wrap: anywhere", async ({ page }) => {
    // Anti-vacuity: if the canonical document were ever edited to `normal`
    // itself, the window rule would be asserting nothing. This pins the
    // arrangement the fix was measured against.
    await page.setViewportSize({ width: 1280, height: 720 });
    await openLesson(page, LESSONS[0]);
    const canonicalDeclaresAnywhere = await page.evaluate(() =>
      [...document.querySelectorAll("style")].some((style) => /\.word-card \.term-display\s*\{[^}]*overflow-wrap:\s*anywhere/.test(style.textContent ?? ""))
    );
    expect(canonicalDeclaresAnywhere).toBe(true);
    const enhancerSheet = await page.evaluate(() => Boolean(document.querySelector('link[rel="stylesheet"][href="/game-suite/canonical-runtime.css"]')));
    expect(enhancerSheet).toBe(true);
  });
});
