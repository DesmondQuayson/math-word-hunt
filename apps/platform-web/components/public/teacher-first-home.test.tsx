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
    expect(screen.getByText("Games, Missouri MAP Prep, image-rich homework, and topic quizzes—one teacher-friendly platform.")).toBeTruthy();
    expect(screen.getByText("Built for teachers. Useful for families. Engaging for learners.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/sign-up");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    // The constellation and the showcase both use the real product art, so
    // several alt texts legitimately appear twice.
    expect(screen.getAllByAltText(/Math Word Hunt game artwork/)[0]!.getAttribute("src")).toContain("math-word-hunt.webp");
    expect(screen.getAllByAltText(/Number Cross addition puzzle/)[0]!.getAttribute("src")).toContain("number-cross.webp");
    expect(screen.getAllByAltText(/MAP Prep workspace/)[0]!.getAttribute("src")).toContain("map-prep-preview.webp");
    expect(screen.getAllByAltText(/homework/i)[0]!.getAttribute("src")).toContain("homework-preview.webp");
    expect(screen.getAllByAltText(/topic quiz/i)[0]!.getAttribute("src")).toContain("quiz-preview.webp");
    // Every constellation node is a working product link.
    expect(screen.getByRole("link", { name: /Math Word Hunt Engage · Games/ }).getAttribute("href")).toBe("/play");
    expect(screen.getByRole("link", { name: /MAP Prep Prepare/ }).getAttribute("href")).toBe("/map-prep");
    expect(screen.getByRole("link", { name: /Homework Practice/ }).getAttribute("href")).toBe("/homework");
    expect(screen.getByRole("link", { name: /Topic Quizzes Check/ }).getAttribute("href")).toBe("/quizzes");
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
