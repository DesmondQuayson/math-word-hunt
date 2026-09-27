import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("teacher-first public homepage", () => {
  it("uses the approved positioning copy: eyebrow, one H1, hero description and supporting line", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(screen.getByText("Teacher-led math resources")).toBeTruthy();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Make every math lesson clearer, more engaging, and ready to teach." })).toBeTruthy();
    expect(screen.getByText("Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform.")).toBeTruthy();
    expect(screen.getByText("Built for teachers. Useful for families. Designed for classroom instruction, extra practice, and middle school math review.")).toBeTruthy();
    // The old Missouri-first hero wording is gone.
    expect(container.textContent).not.toContain("Games, Missouri MAP Prep, image-rich homework, and topic quizzes");
    expect(container.textContent).not.toContain("Teacher-led classroom math resources");
    expect(container.textContent).not.toMatch(/\bMAP Prep\b/);
  });

  it("shows account actions, the approved hero art, and every product card on its unchanged route", () => {
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
  });

  it("carries no Coming Soon / Praxis block on the homepage (owner V2); the only section after the hero is Featured games (owner 2026-09-27)", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.querySelector(".teacher-home-roadmap")).toBeNull();
    expect(container.textContent).not.toMatch(/Coming soon|Praxis|ETS|Middle School Math Review/);
    // Headings: the H1, the authorized-code form heading, then the featured games row.
    expect([...container.querySelectorAll("h1, h2, h3")].map((node) => node.textContent)).toEqual([
      "Make every math lesson clearer, more engaging, and ready to teach.",
      "Authorize Code",
      "Featured games",
      "Math Vocabulary Hunt",
      "Math Tug of War"
    ]);
    cleanup();
    // Signed in, the code card leaves nothing behind.
    const signedIn = render(<TeacherFirstHome authState="signed-in" />);
    expect([...signedIn.container.querySelectorAll("h1, h2, h3")].map((node) => node.textContent)).toEqual([
      "Make every math lesson clearer, more engaging, and ready to teach.",
      "Featured games",
      "Math Vocabulary Hunt",
      "Math Tug of War"
    ]);
  });

  it("features Math Tug of War beside Math Vocabulary Hunt with a free Play for Free Now button to the game", () => {
    for (const authState of ["signed-out", "signed-in"] as const) {
      const { container } = render(<TeacherFirstHome authState={authState} />);
      const cards = [...container.querySelectorAll(".home-featured-games article")];
      expect(cards.map((card) => card.getAttribute("data-game"))).toEqual(["math-vocabulary-hunt", "math-tug-of-war"]);
      const tug = cards[1];
      expect(tug.querySelector("img")?.getAttribute("src")).toContain("math-tug-of-war.webp");
      expect(tug.querySelector("img")?.getAttribute("alt")).toMatch(/^Math Tug of War gameplay artwork/);
      expect(tug.textContent).toContain("Solve the math. Pull the rope. Beat the other side!");
      expect(tug.textContent).toContain("Free with a MathNexa account");
      expect(tug.textContent).not.toMatch(/no sign-up|without an account|subscribe|trial/i);
      const button = screen.getAllByRole("link", { name: "Play for Free Now" });
      expect(button).toHaveLength(1);
      expect(button[0].getAttribute("href")).toBe("/games/math-tug-of-war/play");
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

  it("keeps the homepage concise: no showcase span, no commercial details", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.textContent).not.toMatch(/MathNexa in action|real resources waiting|Designed around teaching|calmer path|Whole-class energy|Interactive Games/i);
    expect(container.textContent).not.toMatch(/\$5\.99|24-hour|stripe|checkout|consent|automatic renewal|phase \d/i);
  });
});
