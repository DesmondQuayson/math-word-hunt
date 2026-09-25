import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("carries no Coming Soon / Praxis block on the homepage (owner V2), leaving the hero followed directly by the page end", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.querySelector(".teacher-home-roadmap")).toBeNull();
    expect(container.textContent).not.toMatch(/Coming soon|Praxis|ETS|Middle School Math Review/);
    // The only headings are the H1 and the authorized-code form heading: no empty section wrapper or orphan heading remains.
    expect([...container.querySelectorAll("h1, h2, h3")].map((node) => node.textContent)).toEqual([
      "Make every math lesson clearer, more engaging, and ready to teach.",
      "Authorize Code"
    ]);
  });

  it("shows the authorized-code entry immediately on the signed-out homepage - zero clicks", () => {
    render(<TeacherFirstHome />);
    expect(screen.getByRole("heading", { name: "Authorize Code" })).toBeTruthy();
    expect(screen.getByLabelText(/^Code/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("keeps the authorized-code entry on the homepage in every account state: same form, same place, same wording, zero clicks", () => {
    // Owner hotfix 2026-09-25: the entry is permanent, not signed-out only.
    // Anonymous, unconfirmed, signed in without access, and entitled visitors
    // all see the unchanged school-code form directly under the hero actions,
    // inside the element the banner's "Authorize Code" link points at.
    for (const props of [
      {},
      { authState: "unconfirmed" as const },
      { authState: "signed-in" as const },
      { authState: "signed-in" as const, entitled: true }
    ]) {
      const label = JSON.stringify(props);
      const { container } = render(<TeacherFirstHome {...props} />);
      const anchor = container.querySelector<HTMLElement>("#authorized-access");
      expect(anchor, label).toBeTruthy();
      const entry = within(anchor as HTMLElement);
      expect(entry.getByRole("heading", { name: "Authorize Code" }), label).toBeTruthy();
      expect(entry.getByLabelText(/^Code/), label).toBeTruthy();
      expect(entry.getByRole("button", { name: "Show code" }), label).toBeTruthy();
      expect(entry.getByRole("button", { name: "Continue" }), label).toBeTruthy();
      expect((anchor as HTMLElement).querySelector('input[name="next"]')?.getAttribute("value"), label).toBe("/games");
      // Placement unchanged: directly after the hero actions, in the hero copy.
      const before = anchor?.previousElementSibling;
      expect(before?.classList.contains("teacher-home-actions") || before?.classList.contains("teacher-home-ready"), label).toBe(true);
      expect(container.textContent, label).not.toContain("Start learning");
      cleanup();
    }
    render(<TeacherFirstHome authState="signed-in" entitled />);
    expect(screen.getByText("Your MathNexa resource shelf is ready below.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
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
