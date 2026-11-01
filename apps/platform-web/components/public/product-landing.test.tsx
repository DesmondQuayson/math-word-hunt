import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameCatalogSummary, PdfLibrarySummary } from "@/lib/seo/catalog-summaries";
import { productPageTrail, type ProductPagePath } from "@/lib/seo/product-pages";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";

const mocks = vi.hoisted(() => ({ games: vi.fn(), pdfs: vi.fn() }));
vi.mock("@/lib/seo/catalog-summaries", () => ({ loadGameCatalogSummary: mocks.games, loadPdfLibrarySummary: mocks.pdfs }));

import HomeworkPdfsPage from "@/app/homework-pdfs/page";
import MathTugOfWarPage from "@/app/math-games/math-tug-of-war/page";
import MathGamesPage from "@/app/math-games/page";
import OnlineMathPrepPage from "@/app/online-math-prep/page";
import QuizPdfsPage from "@/app/quiz-pdfs/page";

const GAMES: GameCatalogSummary = {
  available: true,
  games: [
    { stableKey: "number-cross", thumbnailReference: "builtin:number-cross", title: "Number Cross", description: "Cross out numbers until every row and column reaches its target.", grades: "Grades 3–9", skills: ["mental math", "addition"], freeToPlay: false },
    { stableKey: "math-tug-of-war", thumbnailReference: "", title: "Math Tug of War", description: "Solve the math. Pull the rope. Beat the other side!", grades: "Grades 1–7", skills: ["absolute value"], freeToPlay: true }
  ]
};

const QUIZZES: PdfLibrarySummary = {
  available: true,
  grades: [{ grade: "Grade 6", topics: ["Use Positive Rational Numbers", "Ratios and Rates"] }],
  everyItemHasAnswerKey: true
};

const UNAVAILABLE_PDFS: PdfLibrarySummary = { available: false, grades: [], everyItemHasAnswerKey: false };

const original = process.env.MVH_APP_ENVIRONMENT;

beforeEach(() => {
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  mocks.games.mockResolvedValue(GAMES);
  mocks.pdfs.mockResolvedValue(QUIZZES);
});

afterEach(() => {
  cleanup();
  if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
  else process.env.MVH_APP_ENVIRONMENT = original;
});

const PAGES: ReadonlyArray<readonly [ProductPagePath, () => unknown]> = [
  ["/online-math-prep", OnlineMathPrepPage],
  ["/math-games", MathGamesPage],
  ["/math-games/math-tug-of-war", MathTugOfWarPage],
  ["/homework-pdfs", HomeworkPdfsPage],
  ["/quiz-pdfs", QuizPdfsPage]
];

async function renderPage(page: () => unknown) {
  return render(await (page() as Promise<ReactElement>));
}

function hrefs(container: HTMLElement): string[] {
  return [...container.querySelectorAll("a[href]")].map((link) => link.getAttribute("href") ?? "");
}

describe("public product pages", () => {
  it.each(PAGES)("%s has one heading, its breadcrumb, matching JSON-LD and links to the other pages", async (path, page) => {
    const { container } = await renderPage(page);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const trail = productPageTrail(path);
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getAllByRole("listitem").map((item) => item.textContent?.replace("›", "").trim())).toEqual(trail.map((entry) => entry.name));
    expect(within(breadcrumb).getByText(trail[trail.length - 1].name).getAttribute("aria-current")).toBe("page");
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(script?.textContent ?? "null")).toEqual(breadcrumbStructuredData(trail));
    const more = within(screen.getByRole("region", { name: "More from MathNexa" })).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(more).toHaveLength(4);
    expect(more).not.toContain(path);
  });

  it.each(PAGES)("%s shows how to get access, including the 12-hour school code", async (_path, page) => {
    await renderPage(page);
    const access = screen.getByRole("region", { name: "How to get access" });
    expect(within(access).getByRole("link", { name: "Authorize Code box on the home page" }).getAttribute("href")).toBe("/#authorized-access");
    expect(access.textContent).toContain("for up to 12 hours");
    expect(within(access).getByRole("link", { name: "Help" }).getAttribute("href")).toBe("/help");
  });

  it.each(PAGES)("%s links only to public pages and to product routes that check access, never to a file", async (_path, page) => {
    const { container } = await renderPage(page);
    for (const href of hrefs(container)) {
      expect(href, href).toMatch(/^\/(?:[a-z-]+(?:\/[a-z-]+)*)?(?:#[a-z-]+)?$/);
      expect(href).not.toMatch(/\/resources\/|download|preview/);
    }
    for (const image of container.querySelectorAll("img")) expect(decodeURIComponent(image.getAttribute("src") ?? "")).toContain("/media/");
    expect(container.innerHTML).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it.each(PAGES)("%s does not exist outside the production platform", async (_path, page) => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    // notFound() throws; the async pages reject with it.
    await expect(Promise.resolve().then(() => page())).rejects.toThrow();
  });

  it("Online Math Prep explains the method, the grades and the worked example, and opens the product", async () => {
    await renderPage(OnlineMathPrepPage);
    expect(screen.getByRole("heading", { level: 1, name: "Online Math Prep for Grades 3–8" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Online Math Prep" }).getAttribute("href")).toBe("/map-prep");
    const method = within(screen.getByRole("region", { name: "How each idea is taught" })).getAllByRole("listitem").map((item) => item.querySelector("strong")?.textContent);
    expect(method).toEqual(["Learn", "Guided practice", "Independent practice", "Quick check", "Mastery"]);
    expect(screen.getByText("Find the unit rate: 12 bars ÷ 3 cups = 4 bars per cup.")).toBeTruthy();
    expect(screen.getByText(/not affiliated with or endorsed by the Missouri Department of Elementary and Secondary Education/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "How to get access" }).textContent).toContain("$5.99 USD a month");
  });

  it("Math Games lists the published games with grades and skills, and links only Math Tug of War", async () => {
    const { container } = await renderPage(MathGamesPage);
    expect(screen.getByRole("link", { name: "Open Math Games" }).getAttribute("href")).toBe("/games");
    const cards = [...container.querySelectorAll("article")];
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual(["Number Cross", "Math Tug of War"]);
    expect(cards[0].textContent).toContain("Included with a subscription · Grades 3–9");
    expect(cards[1].textContent).toContain("Free with a MathNexa account · Grades 1–7");
    expect(within(cards[0]).getByRole("list", { name: "Number Cross skills" }).textContent).toBe("mental mathaddition");
    expect(within(cards[0]).queryAllByRole("link")).toHaveLength(0);
    expect(within(cards[1]).getByRole("link", { name: "About Math Tug of War" }).getAttribute("href")).toBe("/math-games/math-tug-of-war");
  });

  it("Math Games still offers the free game when the catalog cannot be read", async () => {
    mocks.games.mockResolvedValue({ available: false, games: [] });
    const { container } = await renderPage(MathGamesPage);
    expect(screen.getByRole("heading", { level: 2, name: "Play for free" })).toBeTruthy();
    expect([...container.querySelectorAll("article h3")].map((heading) => heading.textContent)).toEqual(["Math Tug of War"]);
  });

  it("Math Tug of War states the game's own modes, rules and skills, and plays for free", async () => {
    await renderPage(MathTugOfWarPage);
    expect(screen.getByRole("link", { name: "Play for free" }).getAttribute("href")).toBe("/games/math-tug-of-war/play");
    const modes = within(screen.getByRole("region", { name: "Three ways to play" })).getAllByRole("listitem").map((item) => item.querySelector("strong")?.textContent);
    expect(modes).toEqual(["VS Robot", "Two Teams", "Online Match"]);
    expect(screen.getByText(/shares its 5-character code/)).toBeTruthy();
    expect(screen.getByText("The first side to pull the rope 7 steps from the center wins.")).toBeTruthy();
    const skills = within(screen.getByRole("region", { name: "Six skills to choose from" })).getAllByRole("listitem").map((item) => item.querySelector("strong")?.textContent);
    expect(skills).toEqual(["Addition", "Subtraction", "Multiplication", "Addition & Subtraction of Integers", "Opposite of Integers", "Absolute Value"]);
    expect(screen.getByText(/a name of up to 20 characters/)).toBeTruthy();
    const access = screen.getByRole("region", { name: "How to get access" });
    expect(access.textContent).toContain("You do not need a trial or subscription to play it.");
    expect(access.textContent).not.toContain("$5.99");
  });

  it("the PDF pages list the live grades and topics, and claim answer keys only when every PDF has one", async () => {
    await renderPage(QuizPdfsPage);
    expect(mocks.pdfs).toHaveBeenLastCalledWith("quizzes");
    expect(screen.getByRole("link", { name: "Open Quiz PDFs" }).getAttribute("href")).toBe("/quizzes");
    const topics = screen.getByRole("region", { name: "Grades and topics" });
    expect(within(topics).getByRole("heading", { level: 3, name: "Grade 6" })).toBeTruthy();
    expect(within(topics).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Use Positive Rational Numbers", "Ratios and Rates"]);
    expect(screen.getByText("Every quiz PDF has an answer key.")).toBeTruthy();
    cleanup();

    mocks.pdfs.mockResolvedValue({ ...QUIZZES, everyItemHasAnswerKey: false });
    await renderPage(HomeworkPdfsPage);
    expect(mocks.pdfs).toHaveBeenLastCalledWith("homework");
    expect(screen.getByRole("link", { name: "Open Homework PDFs" }).getAttribute("href")).toBe("/homework");
    expect(screen.queryByText(/has an answer key/)).toBeNull();
  });

  it("the PDF pages keep their general text when the library cannot be read", async () => {
    mocks.pdfs.mockResolvedValue(UNAVAILABLE_PDFS);
    await renderPage(HomeworkPdfsPage);
    expect(screen.getByRole("region", { name: "What you get" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Grades and topics" })).toBeNull();
  });
});
