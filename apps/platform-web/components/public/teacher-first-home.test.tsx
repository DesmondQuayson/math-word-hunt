import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeacherFirstHome } from "./teacher-first-home";

vi.mock("@/app/auth-actions", () => ({
  checkEmailConfirmationAction: vi.fn(async (state) => state),
  resendConfirmationAction: vi.fn(async (state) => state)
}));

afterEach(cleanup);

describe("teacher-first public homepage", () => {
  it("shows signed-out account actions, accurate resource copy, and real product visuals", () => {
    render(<TeacherFirstHome numberCrossPublished />);
    expect(screen.getByText("Teacher-led classroom math resources")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Make every math lesson clearer, more engaging, and ready to teach." })).toBeTruthy();
    expect(screen.getByText("Interactive games, Missouri MAP Prep, image-rich homework, and classroom-ready quizzes—all in one teacher-friendly math platform.")).toBeTruthy();
    expect(screen.getByText("Built for teachers. Useful for families. Engaging for learners.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/sign-up");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.getByAltText(/Math Word Hunt game artwork/).getAttribute("src")).toContain("math-word-hunt.webp");
    expect(screen.getByAltText(/Number Cross addition puzzle/).getAttribute("src")).toContain("number-cross.webp");
    expect(screen.getByAltText(/MAP Prep workspace/).getAttribute("src")).toContain("map-prep-preview.webp");
    expect(screen.getByAltText(/snack-bag unit-rate problem/).getAttribute("src")).toContain("homework-preview.webp");
    expect(screen.getByAltText(/Grade 7 topic quiz/).getAttribute("src")).toContain("quiz-preview.webp");
    expect(screen.getByText("Homework is organized by grade, topic, and lesson. Quizzes are organized by grade and topic.")).toBeTruthy();
  });

  it("removes signed-out calls to action for an authenticated entitled subscriber", () => {
    render(<TeacherFirstHome authState="signed-in" entitled numberCrossPublished />);
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByText("Your MathNexa resource shelf is ready below.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Math Word Hunt Play now/ }).getAttribute("href")).toBe("/play");
    expect(screen.getByRole("link", { name: /Number Cross Play now/ }).getAttribute("href")).toBe("/games/number-cross/play");
  });

  it("labels Number Cross honestly when the authoritative catalog does not publish it", () => {
    render(<TeacherFirstHome />);
    expect(screen.getByLabelText("Number Cross preview, coming soon")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Number Cross/ })).toBeNull();
  });

  it("keeps commercial details out of the signed-out homepage", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.textContent).not.toMatch(/\$5\.99|24-hour|stripe|checkout|consent|automatic renewal|phase \d/i);
    expect(container.textContent).not.toContain("quizzes—organized by grade, topic, and lesson");
  });
});
