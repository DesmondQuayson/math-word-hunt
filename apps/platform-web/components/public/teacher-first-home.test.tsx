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
  it("shows account actions, the approved hero art, and every constellation product link", () => {
    render(<TeacherFirstHome />);
    expect(screen.getByText("Teacher-led classroom math resources")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Make every math lesson clearer, more engaging, and ready to teach." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/sign-up");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    // The approved Math Vocabulary Hunt key art, not the Math Word Hunt split art.
    expect(decodeURIComponent(screen.getByAltText(/Math Vocabulary Hunt game artwork/).getAttribute("src") ?? "")).toContain("/media/games/math-vocabulary-hunt.webp");
    expect(screen.getByRole("link", { name: /Math Vocabulary Hunt Engage · Games/ }).getAttribute("href")).toBe("/play");
    expect(screen.getByRole("link", { name: /MAP Prep Prepare/ }).getAttribute("href")).toBe("/map-prep");
    expect(screen.getByRole("link", { name: /Homework Practice/ }).getAttribute("href")).toBe("/homework");
    expect(screen.getByRole("link", { name: /Topic Quizzes Check/ }).getAttribute("href")).toBe("/quizzes");
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
