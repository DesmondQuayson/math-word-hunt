import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeacherFirstHome } from "./teacher-first-home";

afterEach(cleanup);

describe("teacher-first public homepage", () => {
  it("renders the approved message and four classroom resource modules", () => {
    render(<TeacherFirstHome />);
    expect(screen.getByText("TEACHER-LED CLASSROOM MATH RESOURCES")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Make every math lesson clearer, more engaging, and ready to teach." })).toBeTruthy();
    expect(screen.getByText("Interactive games, Missouri MAP Prep, image-rich homework PDFs, and classroom-ready quizzes—organized by grade, topic, and lesson.")).toBeTruthy();
    expect(screen.getByText("Built for teachers. Useful for families. Engaging for learners.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/sign-up");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    for (const [name, href] of [["Games", "/games"], ["MAP Prep", "/map-prep"], ["Homework", "/homework"], ["Quizzes", "/quizzes"]]) {
      expect(screen.getByRole("link", { name: `Explore ${name}` }).getAttribute("href")).toBe(href);
    }
  });

  it("keeps commercial details out of the signed-out homepage", () => {
    const { container } = render(<TeacherFirstHome />);
    expect(container.textContent).not.toMatch(/\$5\.99|24-hour|stripe|checkout|consent|automatic renewal|phase \d/i);
  });
});
