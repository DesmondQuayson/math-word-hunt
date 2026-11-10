import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PLATFORM_HOMEPAGE_DESCRIPTION } from "@/lib/seo/platform-positioning";

import { homeFreeGames } from "@/lib/games/home-free-games";

import { TeacherFirstHome } from "./teacher-first-home";

vi.mock("@/app/auth-actions", () => ({
  checkEmailConfirmationAction: vi.fn(async (state) => state),
  resendConfirmationAction: vi.fn(async (state) => state)
}));

vi.mock("@/app/school-access-actions", () => ({
  authorizeSchoolAccessAction: vi.fn(async (state) => state),
  exitSchoolAccessAction: vi.fn()
}));

afterEach(cleanup);

const HEADLINE = "Online math prep that shows the thinking, not just the answer.";
const FREE_KEYS = ["polygon-showdown", "math-bingo-live", "math-tug-of-war"];
const FREE_TITLES = ["Polygon Showdown", "Math Bingo Live", "Math Tug of War"];
const SUBSCRIPTION_GAMES = { "crosscalc": "/games/crosscalc/play", "number-logic": "/games/number-logic/play", "number-cross": "/games/number-cross/play", "math-vocabulary-hunt": "/play" } as const;

describe("teacher-first public homepage", () => {
  it("leads with online math prep: eyebrow, one H1, and the owner's description and audience lines unchanged", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(screen.getByText("Online math prep · Grades 3–8")).toBeTruthy();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: HEADLINE })).toBeTruthy();
    // The hero lede is still the owner's exact sentence, the same text as the meta description.
    expect(screen.getByText("Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform.")).toBeTruthy();
    expect(screen.getByText(PLATFORM_HOMEPAGE_DESCRIPTION)).toBeTruthy();
    expect(screen.getByText("Built for teachers. Useful for families. Designed for classroom instruction, extra practice, and middle school math review.")).toBeTruthy();
    // The old Missouri-first hero wording is gone.
    expect(container.textContent).not.toContain("Games, Missouri MAP Prep, image-rich homework, and topic quizzes");
    expect(container.textContent).not.toContain("Teacher-led classroom math resources");
    expect(container.textContent).not.toMatch(/\bMAP Prep\b/);
  });

  it("shows account actions, the approved product art, and every product card on its unchanged route", () => {
    render(<TeacherFirstHome />);
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/sign-up");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    // The approved Math Vocabulary Hunt key art, not the Math Word Hunt split art.
    expect(decodeURIComponent(screen.getByAltText(/Math Vocabulary Hunt game artwork/).getAttribute("src") ?? "")).toContain("/media/games/math-vocabulary-hunt.webp");
    // New customer-facing names; the route paths behind them are the indexed originals.
    expect(screen.getByRole("link", { name: /Math Games Engage · Practice/ }).getAttribute("href")).toBe("/games");
    expect(screen.getByRole("link", { name: /Online Math Prep \(Grades 3–8\) Learn · Practice · Review · Worksheet Generator/ }).getAttribute("href")).toBe("/map-prep");
    expect(screen.getByRole("link", { name: /Homework PDFs Practice · Print/ }).getAttribute("href")).toBe("/homework");
    expect(screen.getByRole("link", { name: /Quiz PDFs Assess · Print/ }).getAttribute("href")).toBe("/quizzes");
    expect(screen.getByText(/One connected system:/).textContent).toBe("One connected system: engage, learn, practice, assess.");
    // Online Math Prep leads the shelf.
    expect(document.querySelector("[data-product]")?.getAttribute("data-product")).toBe("map-prep");
  });

  it("orders the page hero, toolkit, Free math games, with no Coming Soon / Praxis block (owner V2) and no removed sections (owner 2026-10-26)", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.querySelector(".teacher-home-roadmap")).toBeNull();
    expect(container.textContent).not.toMatch(/Coming soon|Praxis|ETS|Middle School Math Review/);
    // The owner removed "Inside Online Math Prep" and "Made for the kitchen table and the classroom".
    expect(container.textContent).not.toMatch(/Inside Online Math Prep|A prep session|kitchen table|After school, at home|In the classroom|Explore Online Math Prep|Find a Homework PDF|Find a Quiz PDF/);
    const after = ["Prepare online, practice on paper, check what stuck", "Free math games", ...FREE_TITLES];
    // Headings: the H1, the authorized-code form heading, then the sections in order.
    expect([...container.querySelectorAll("h1, h2, h3")].map((node) => node.textContent)).toEqual([HEADLINE, "Authorize Code", ...after]);
    cleanup();
    // Signed in, the code card leaves nothing behind.
    const signedIn = render(<TeacherFirstHome authState="signed-in" />);
    expect([...signedIn.container.querySelectorAll("h1, h2, h3")].map((node) => node.textContent)).toEqual([HEADLINE, ...after]);
  });

  it("works one example problem in the hero, labelled as an example, with correct arithmetic", () => {
    render(<TeacherFirstHome />);
    const board = screen.getByRole("figure", { name: /^Example: a Grade 6 ratio problem/ });
    const text = board.textContent ?? "";
    expect(text).toContain("3 cups of oats make 12 granola bars. How many cups make 20 bars?");
    // The margin note names the method of the first step (4 bars per cup is
    // the unit rate); it is part of the worked example, not an app hint.
    expect(text).toContain("find the unit rate");
    expect(text).not.toContain("find 1 cup first");
    expect(text).toContain("12 bars ÷ 3 cups = 4 bars per cup");
    expect(text).toContain("20 bars ÷ 4 = 5 cups");
    // The board checks by multiplying back; it never claims to grade anyone's work.
    expect(text).toContain("Check: 5 cups × 4 = 20 bars");
    expect(text).not.toMatch(/Correct|your work shows/i);
    const [cups, bars, target] = [3, 12, 20];
    expect(bars / cups).toBe(4);
    expect(target / (bars / cups)).toBe(5);
    expect(5 * (bars / cups)).toBe(target);
    expect(within(board).getByRole("img", { name: /1 cup matches 4 bars, 3 cups match 12 bars, 5 cups match 20 bars/ })).toBeTruthy();
    expect(within(board).getByRole("list", { name: "Example session progress" }).textContent).toBe("LearnPracticeReview");
  });

  it("hands the visitor a problem of their own: feedback shows the reasoning, nothing is sent", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<TeacherFirstHome />);
    const turn = screen.getByRole("group", { name: "Your turn How many cups make 28 bars?" });
    const choices = within(turn).getAllByRole("button");
    expect(choices.map((button) => button.textContent)).toEqual(["6 cups", "7 cups", "8 cups"]);
    for (const button of choices) expect(button.getAttribute("aria-pressed")).toBe("false");
    await user.click(within(turn).getByRole("button", { name: "6 cups" }));
    expect(turn.textContent).toContain("Not quite: 6 cups × 4 = 24 bars. Try again.");
    await user.click(within(turn).getByRole("button", { name: "8 cups" }));
    expect(turn.textContent).toContain("Not quite: 8 cups × 4 = 32 bars. Try again.");
    await user.click(within(turn).getByRole("button", { name: "7 cups" }));
    expect(turn.textContent).toContain("Yes: 7 cups × 4 = 28 bars.");
    expect(within(turn).getByRole("button", { name: "7 cups" }).getAttribute("aria-pressed")).toBe("true");
    expect(28 / 4).toBe(7);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("shows Online Math Prep, not the retired Missouri MAP Prep name, in the shelf preview", () => {
    render(<TeacherFirstHome />);
    expect(decodeURIComponent(screen.getByAltText(/Online Math Prep workspace/).getAttribute("src") ?? "")).toContain("/media/home/online-math-prep-preview.webp");
    // The preview is a homepage-only drawing; its source carries the visible title.
    const source = readFileSync(resolve(process.cwd(), "public/media/home/online-math-prep-preview-source.svg"), "utf8");
    expect(source).toContain(">Online Math Prep</text>");
    expect(source).not.toMatch(/Missouri|MAP Prep/);
    // The mathematics in the drawing is unchanged: 2 notebooks cost $5, 4 cost $10, y = 2.5x.
    expect(source).toContain(">y = 2.5x</text>");
    expect(source).toContain(">$5</text>");
    expect(source).toContain(">$10</text>");
  });

  it("shows the worked example with no manual controls (owner, after v1.2.27): it replays on its own", () => {
    render(<TeacherFirstHome />);
    const board = screen.getByRole("figure");
    expect(board.textContent).toContain("Check: 5 cups × 4 = 20 bars");
    expect(screen.queryByRole("button", { name: /worked example/i })).toBeNull();
    // The only buttons in the board's stage are the three "Your turn" answers.
    expect([...board.parentElement!.parentElement!.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["6 cups", "7 cups", "8 cups"]);
  });

  it("keeps illustrations decorative: drawn scenes are hidden from assistive technology and the only pictures are product screens", () => {
    const { container } = render(<TeacherFirstHome />);
    for (const scene of [...container.querySelectorAll("svg")].filter((svg) => !svg.closest("#authorized-access"))) {
      const labelled = scene.getAttribute("role") === "img" && scene.getAttribute("aria-label");
      expect(labelled || scene.getAttribute("aria-hidden") === "true").toBeTruthy();
    }
    const sources = [...container.querySelectorAll("img")].map((image) => decodeURIComponent(image.getAttribute("src") ?? ""));
    // Four product-shelf screens and the three free games.
    expect(sources.length).toBe(7);
    for (const source of sources) expect(source).toMatch(/\/media\/(home|games)\/[a-z0-9-]+\.webp/);
  });

  it("sizes the shelf images to their real slots, so phones and tablets get small files", () => {
    const { container } = render(<TeacherFirstHome />);
    const image = (product: string) => container.querySelector(`[data-product="${product}"] img`)!;
    expect(image("map-prep").getAttribute("sizes")).toBe("(max-width: 48rem) 92vw, (max-width: 78rem) 55vw, 43rem");
    for (const product of ["games", "homework", "quizzes"]) {
      const card = image(product);
      // A phone row thumbnail is about 36vw, a tablet or desktop column about 31vw, at most 24rem.
      expect(card.getAttribute("sizes")).toBe("(max-width: 34rem) 36vw, (max-width: 78rem) 31vw, 24rem");
      // So the srcset now offers the 256 and 384 px files a phone thumbnail needs.
      expect(card.getAttribute("srcset")).toMatch(/ 256w, .* 384w, /);
    }
    // Free game thumbnails are sized to the compact card columns, never the 1200px original.
    const featured = [...container.querySelectorAll(".home-featured-games img")];
    expect(featured).toHaveLength(3);
    for (const image of featured) {
      expect(image.getAttribute("sizes")).toBe("(min-width: 68rem) 18rem, (min-width: 48rem) 32vw, (min-width: 22rem) 48vw, 100vw");
      expect(image.getAttribute("srcset")).toMatch(/ 384w, .* 640w, /);
      // Below the fold: lazy, never prioritised over the hero.
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("fetchpriority")).not.toBe("high");
    }
  });

  it("shows free games only, Polygon Showdown first, each with its free button and the Free badge", () => {
    for (const authState of ["signed-out", "signed-in"] as const) {
      const { container } = render(<TeacherFirstHome authState={authState} />);
      const section = screen.getByRole("region", { name: "Free math games" });
      expect(within(section).getByRole("heading", { level: 2, name: "Free math games" })).toBeTruthy();
      const cards = [...container.querySelectorAll<HTMLElement>(".home-featured-games article")];
      expect(cards.map((card) => card.getAttribute("data-game"))).toEqual(FREE_KEYS);
      const card = (key: string) => cards.find((entry) => entry.getAttribute("data-game") === key)!;
      for (const entry of cards) expect(within(entry).getByText("Free", { selector: ".game-free-badge" })).toBeTruthy();

      const polygon = card("polygon-showdown");
      expect(polygon.querySelector("img")?.getAttribute("alt")).toMatch(/^Polygon Showdown gameplay: an 8 by 8 board/);
      expect(decodeURIComponent(polygon.querySelector("img")?.getAttribute("src") ?? "")).toContain("/media/games/polygon-showdown.webp");
      expect(polygon.textContent).toContain("Geometry");
      expect(polygon.textContent).toContain("Match shapes, earn coins, and challenge friends.");
      expect(within(polygon).getByRole("link", { name: "Play Free Polygon Showdown" }).getAttribute("href")).toBe("/games/polygon-showdown/play");

      const tug = card("math-tug-of-war");
      expect(tug.querySelector("img")?.getAttribute("alt")).toMatch(/^Math Tug of War gameplay artwork/);
      expect(tug.textContent).toContain("Solve the math. Pull the rope. Beat the other side!");
      expect(within(tug).getByRole("link", { name: "Play Free Math Tug of War" }).getAttribute("href")).toBe("/games/math-tug-of-war/play");

      // Math Bingo Live: free to host; students join with a code (no account).
      const bingo = card("math-bingo-live");
      expect(bingo.querySelector("img")?.getAttribute("alt")).toMatch(/^Math Bingo Live gameplay/);
      expect(within(bingo).getByRole("link", { name: "Host Game Math Bingo Live" }).getAttribute("href")).toBe("/games/math-bingo-live/host");
      expect(screen.getByRole("link", { name: "Join with a code" }).getAttribute("href")).toBe("/join");

      // Says what it holds without promising anonymous play: free games need a free MathNexa account.
      expect(section.textContent).toContain("Free with a MathNexa account. No subscription needed.");
      expect(section.textContent).not.toMatch(/no sign-up|without an account|no account|subscribe|trial|pricing/i);
      expect(section.querySelector('a[href="/pricing"], a[href="/subscription"]')).toBeNull();
      // Compact: one short line of copy per card, no long paragraph.
      for (const entry of cards) expect(entry.querySelector(".home-game-blurb")!.textContent!.length).toBeLessThanOrEqual(60);
      cleanup();
    }
  });

  it("keeps subscription games off the homepage and leads to the full catalog with View all math games", () => {
    for (const authState of ["signed-out", "signed-in"] as const) {
      for (const entitled of [false, true]) {
        const { container } = render(<TeacherFirstHome authState={authState} entitled={entitled} />);
        const section = container.querySelector<HTMLElement>(".home-featured-games")!;
        // No subscription card, label or button, whoever is looking.
        expect(section.textContent, `${authState} ${entitled}`).not.toMatch(/Subscription|Play Now|CrossCalc|Number Logic|Number Cross|Math Vocabulary Hunt/);
        for (const [key, href] of Object.entries(SUBSCRIPTION_GAMES)) {
          expect(section.querySelector(`[data-game="${key}"]`), key).toBeNull();
          expect(section.querySelector(`a[href="${href}"]`), key).toBeNull();
        }
        // The full catalog is one click away, after the cards.
        const viewAll = within(section).getByRole("link", { name: "View all math games" });
        expect(viewAll.getAttribute("href")).toBe("/math-games");
        expect(section.lastElementChild?.contains(viewAll)).toBe(true);
        expect(section.querySelector(".game-card-grid")!.compareDocumentPosition(viewAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        cleanup();
      }
    }
  });

  it("shows only the free games the catalog has published, in homepage order, and no section when none are", () => {
    const published = (keys: string[]) => homeFreeGames(keys.map((stableKey) => ({ stableKey, title: stableKey, description: `${stableKey}.`, thumbnailReference: `builtin:${stableKey}` })));
    const { container } = render(<TeacherFirstHome freeGames={published(["number-cross", "math-tug-of-war", "crosscalc", "polygon-showdown"])} />);
    expect([...container.querySelectorAll(".home-featured-games article")].map((card) => card.getAttribute("data-game"))).toEqual(["polygon-showdown", "math-tug-of-war"]);
    cleanup();
    for (const keys of [[], ["number-cross", "crosscalc", "number-logic", "math-vocabulary-hunt"]]) {
      const empty = render(<TeacherFirstHome freeGames={published(keys)} />);
      expect(empty.container.querySelector(".home-featured-games"), keys.join()).toBeNull();
      expect(screen.queryByRole("heading", { name: "Free math games" })).toBeNull();
      cleanup();
    }
  });

  it("shows the authorized-code entry immediately on the signed-out homepage - zero clicks", () => {
    render(<TeacherFirstHome />);
    expect(screen.getByRole("heading", { name: "Authorize Code" })).toBeTruthy();
    expect(screen.getByLabelText(/^Code/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("A: signed out, the Authorize Code card is on the homepage: heading, masked Code field, Show/Hide, Continue, next=/games, under the hero actions", async () => {
    const user = userEvent.setup();
    const { container } = render(<TeacherFirstHome authState="signed-out" />);
    const anchor = container.querySelector<HTMLElement>("#authorized-access") as HTMLElement;
    expect(anchor).toBeTruthy();
    expect(anchor.classList.contains("teacher-home-authorized-access")).toBe(true);
    const entry = within(anchor);
    expect(entry.getByRole("heading", { name: "Authorize Code" })).toBeTruthy();
    const code = entry.getByLabelText(/^Code/) as HTMLInputElement;
    expect(code.getAttribute("type")).toBe("password");
    expect(code.getAttribute("name")).toBe("authorizedCode");
    expect(entry.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(anchor.querySelector('input[name="next"]')?.getAttribute("value")).toBe("/games");
    // Show/Hide works: the same field switches between masked and plain text.
    await user.click(entry.getByRole("button", { name: "Show code" }));
    expect(code.getAttribute("type")).toBe("text");
    await user.click(entry.getByRole("button", { name: "Hide code" }));
    expect(code.getAttribute("type")).toBe("password");
    // Placement unchanged: directly after the hero actions, in the hero copy.
    expect(anchor.previousElementSibling?.classList.contains("teacher-home-actions")).toBe(true);
    expect(anchor.parentElement?.classList.contains("teacher-home-copy")).toBe(true);
    expect(container.textContent).not.toContain("Start learning");
  });

  it("B-F: any authenticated session renders no Authorize Code card at all: no heading, field, eye control, Continue or container", () => {
    // Owner hotfix 2026-09-26: the homepage code entry is for signed-out
    // visitors only. Whether the account has access plays no part: an
    // unconfirmed account, a signed-in account without access (never used a
    // trial, used trial, payment problem) and an entitled account (active
    // trial, subscriber) all get the same result. The card is not rendered,
    // so nothing is left to hide and no space is reserved.
    for (const props of [
      { authState: "unconfirmed" as const },
      { authState: "signed-in" as const },
      { authState: "signed-in" as const, entitled: false },
      { authState: "signed-in" as const, entitled: true }
    ]) {
      const label = JSON.stringify(props);
      const { container } = render(<TeacherFirstHome {...props} />);
      expect(container.querySelector("#authorized-access"), label).toBeNull();
      expect(container.querySelector(".teacher-home-authorized-access, .authorized-access-panel, .authorized-access-form, #authorized-code"), label).toBeNull();
      expect(screen.queryByRole("heading", { name: "Authorize Code" }), label).toBeNull();
      expect(screen.queryByLabelText(/^Code/), label).toBeNull();
      expect(screen.queryByRole("button", { name: /Show code|Hide code/ }), label).toBeNull();
      expect(screen.queryByRole("button", { name: "Continue" }), label).toBeNull();
      expect(container.textContent, label).not.toContain("Authorize Code");
      // The hero actions (or the ready note) close the hero copy: no empty wrapper follows them.
      const copy = container.querySelector(".teacher-home-copy") as HTMLElement;
      const last = copy.lastElementChild;
      expect(last?.classList.contains("teacher-home-actions") || last?.classList.contains("teacher-home-ready"), label).toBe(true);
      expect(container.textContent, label).not.toContain("Start learning");
      cleanup();
    }
    render(<TeacherFirstHome authState="signed-in" entitled />);
    expect(screen.getByText("Your MathNexa resource shelf is ready below.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    cleanup();
    render(<TeacherFirstHome authState="signed-in" />);
    expect(screen.getByRole("link", { name: "View access options" }).getAttribute("href")).toBe("/subscription");
    expect(screen.getByRole("link", { name: "My Account" }).getAttribute("href")).toBe("/account");
  });

  it("shows the exit control in that place instead of a second code prompt while an authorized code is already active", () => {
    const { container } = render(<TeacherFirstHome authState="signed-out" entitled schoolAccess />);
    const anchor = container.querySelector<HTMLElement>("#authorized-access") as HTMLElement;
    expect(within(anchor).getByRole("heading", { name: "Authorized access active" })).toBeTruthy();
    expect(within(anchor).getByRole("button", { name: "Exit authorized access" })).toBeTruthy();
    expect(screen.queryByLabelText(/^Code/)).toBeNull();
  });

  it("carries no commercial details, testimonials, statistics or retired showcase copy", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.textContent).not.toMatch(/MathNexa in action|real resources waiting|Designed around teaching|calmer path|Whole-class energy|Interactive Games/i);
    expect(container.textContent).not.toMatch(/\$5\.99|24-hour|stripe|checkout|consent|automatic renewal|phase \d/i);
    expect(container.textContent).not.toMatch(/\d+\s?%|testimonial|rated|reviews|★|“|”/i);
  });

  it("every homepage link goes to an existing, unchanged route", () => {
    for (const authState of ["signed-out", "signed-in"] as const) {
      const { container } = render(<TeacherFirstHome authState={authState} />);
      const hrefs = new Set([...container.querySelectorAll("a")].map((link) => link.getAttribute("href")));
      for (const href of hrefs) expect(["/sign-up", "/sign-in", "/subscription", "/account", "/games", "/map-prep", "/homework", "/quizzes", "/worksheets", "/games/polygon-showdown/play", "/games/math-tug-of-war/play", "/games/math-bingo-live/host", "/join", "/math-games"], `${authState} ${href}`).toContain(href);
      cleanup();
    }
  });
});
