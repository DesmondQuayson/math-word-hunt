import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicResourceLibrary } from "./public-resource-library";

afterEach(() => cleanup());

const taxonomy = {
  grades: [{ id: "grade-4", title: "Grade 4", sortOrder: 4 }],
  topics: [{ id: "topic-fractions", gradeId: "grade-4", title: "Fractions", sortOrder: 2 }],
  lessons: [{ id: "lesson-equivalent", topicId: "topic-fractions", title: "Equivalent fractions", sortOrder: 1 }]
} as const;
const resource = {
  id: "10000000-0000-4000-8000-000000000001", title: "Topic 2 Quiz", description: "Reviewed quiz.",
  resourceType: "quiz_pdf", gradeId: "grade-4", topicId: "topic-fractions", lessonId: null,
  grade: "Grade 4", topic: "Fractions", topicNumber: 2, lesson: null, difficulty: "core", minutes: 15,
  tags: ["fractions"], previewFileIds: [], downloadable: true, isAnswerKey: false,
  answerKeyResourceId: "10000000-0000-4000-8000-000000000002"
} as const;

describe("public resource hierarchy", () => {
  it("shows a truthful entitled empty state without fabricated curriculum", () => {
    render(<PublicResourceLibrary kind="homework" library={{ taxonomy: { grades: [], topics: [], lessons: [] }, resources: [] }} />);
    expect(screen.getByText(/No published homework yet/)).toBeTruthy();
    expect(screen.getByText(/subscription is active/i)).toBeTruthy();
  });

  it("uses Grade and Topic only for quizzes and exposes paired answer-key availability", () => {
    render(<PublicResourceLibrary kind="quizzes" library={{ taxonomy, resources: [resource] }} />);
    expect(screen.queryByLabelText("Lesson")).toBeNull();
    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "grade-4" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "topic-fractions" } });
    expect(screen.getByRole("heading", { name: "Topic 2 Quiz" })).toBeTruthy();
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Answer key" }).getAttribute("href")).toBe(`/resources/${resource.answerKeyResourceId}/download`);
    expect(document.body.textContent).not.toContain("resource-files");
  });
});
