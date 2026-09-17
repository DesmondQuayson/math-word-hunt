import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeacherFirstHome } from "./teacher-first-home";

vi.mock("@/app/auth-actions", () => ({
  checkEmailConfirmationAction: vi.fn(async (state) => state),
  resendConfirmationAction: vi.fn(async (state) => state)
}));

vi.mock("@/app/school-access-actions", () => ({
  authorizeSchoolAccessAction: vi.fn(async (state) => state)
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

  it("keeps the future middle-school note out of the hero and never claims a Praxis course or endorsement", () => {
    const { container } = render(<TeacherFirstHome />);
    const hero = container.querySelector(".teacher-home-hero");
    const roadmap = container.querySelector(".teacher-home-roadmap");
    expect(hero?.textContent).not.toMatch(/Praxis|Coming soon/);
    expect(roadmap?.textContent).toContain("Middle School Math Review resources for educators, including content review useful when preparing for Praxis® Mathematics (5164).");
    expect(roadmap?.textContent).toContain("not affiliated with, sponsored by, or endorsed by ETS");
    expect(roadmap?.textContent).toContain("does not offer a Praxis preparation course");
    expect(screen.getByRole("heading", { level: 2, name: "Coming soon" })).toBeTruthy();
  });

  it("shows the authorized-code entry immediately on the signed-out homepage - zero clicks", () => {
    render(<TeacherFirstHome />);
    expect(screen.getByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeTruthy();
    expect(screen.getByLabelText(/Authorized code/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("does not prompt subscribers or signed-in users for a code on the homepage", () => {
    render(<TeacherFirstHome authState="signed-in" entitled />);
    expect(screen.queryByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeNull();
    expect(screen.getByText("Your MathNexa resource shelf is ready below.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
  });

  it("keeps the homepage concise: no showcase span, no commercial details", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.textContent).not.toMatch(/MathNexa in action|real resources waiting|Designed around teaching|calmer path|Whole-class energy|Interactive Games/i);
    expect(container.textContent).not.toMatch(/\$5\.99|24-hour|stripe|checkout|consent|automatic renewal|phase \d/i);
  });
});
