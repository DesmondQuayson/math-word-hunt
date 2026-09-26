import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  tags: ["fractions"], previewFileIds: [], downloadable: true, isAnswerKey: false, answerKeyIncluded: false,
  answerKeyResourceId: "10000000-0000-4000-8000-000000000002"
} as const;

// A Grade 6 corpus organized topic by topic (the Quiz PDFs V1 shape), next to
// a Grade 7 that exists in the shared taxonomy for Homework but has no quiz.
const quizTaxonomy = {
  grades: [{ id: "grade-6", title: "Grade 6", sortOrder: 6 }, { id: "grade-7", title: "Grade 7", sortOrder: 7 }],
  topics: [
    { id: "g6-t2", gradeId: "grade-6", title: "Understanding and Using Percent", sortOrder: 2 },
    { id: "g6-t1", gradeId: "grade-6", title: "Ratios and Rates", sortOrder: 1 },
    { id: "g6-t3", gradeId: "grade-6", title: "Positive Rational Numbers", sortOrder: 3 },
    { id: "g7-t1", gradeId: "grade-7", title: "Proportional Relationships", sortOrder: 1 }
  ],
  lessons: [{ id: "g6-t1-l1", topicId: "g6-t1", title: "Lesson 1: Ratio language", sortOrder: 1 }]
} as const;
function quiz(id: string, topicId: string, topicNumber: number, topic: string, title: string) {
  return {
    id, title, description: `Success criteria: ${title}. Answers are included on the final page.`, resourceType: "quiz_pdf",
    gradeId: "grade-6", topicId, lessonId: null, grade: "Grade 6", topic, topicNumber, lesson: null, difficulty: null, minutes: null,
    tags: ["grade-6", "quiz"], previewFileIds: [], downloadable: true, isAnswerKey: false, answerKeyIncluded: true, answerKeyResourceId: null
  } as const;
}
const grade6Quizzes = [
  quiz("20000000-0000-4000-8000-000000000002", "g6-t2", 2, "Understanding and Using Percent", "Understanding and Using Percent"),
  quiz("20000000-0000-4000-8000-000000000001", "g6-t1", 1, "Ratios and Rates", "Ratios And Rates Practice"),
  quiz("20000000-0000-4000-8000-000000000003", "g6-t3", 3, "Positive Rational Numbers", "Positive Rational Numbers Practice")
];

describe("public resource hierarchy", () => {
  it("shows a truthful entitled empty state without fabricated curriculum", () => {
    render(<PublicResourceLibrary kind="homework" library={{ taxonomy: { grades: [], topics: [], lessons: [] }, resources: [] }} />);
    expect(screen.getByText(/No published homework yet/)).toBeTruthy();
    expect(screen.getByText(/subscription is active/i)).toBeTruthy();
  });

  it("keeps Homework lesson-by-lesson: Grade, Topic and Lesson selectors and the lesson path on the card", () => {
    const homework = { ...resource, resourceType: "homework_pdf", lessonId: "lesson-equivalent", lesson: "Equivalent fractions", title: "Equivalent fractions practice", answerKeyResourceId: null } as const;
    render(<PublicResourceLibrary kind="homework" library={{ taxonomy, resources: [homework] }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Homework PDFs" })).toBeTruthy();
    expect(screen.getByText("Grade → Topic → Lesson")).toBeTruthy();
    expect(screen.getByText("Preview a lesson activity and download its PDF.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "grade-4" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "topic-fractions" } });
    fireEvent.change(screen.getByLabelText("Lesson"), { target: { value: "lesson-equivalent" } });
    expect(screen.getByRole("heading", { name: "Equivalent fractions practice" })).toBeTruthy();
    expect(screen.getByText("Grade 4 / Topic 2: Fractions / Equivalent fractions")).toBeTruthy();
    expect(screen.getByText("Not published")).toBeTruthy();
    expect(screen.queryByText("Quiz PDF")).toBeNull();
  });

  it("uses Grade and Topic only for quizzes and exposes paired answer-key availability", () => {
    render(<PublicResourceLibrary kind="quizzes" library={{ taxonomy, resources: [resource] }} />);
    expect(screen.queryByLabelText("Lesson")).toBeNull();
    expect(screen.queryByLabelText("Topic")).toBeNull();
    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "grade-4" } });
    expect(screen.getByRole("heading", { name: "Topic 2 Quiz" })).toBeTruthy();
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Answer key" }).getAttribute("href")).toBe(`/resources/${resource.answerKeyResourceId}/download`);
    expect(document.body.textContent).not.toContain("resource-files");
  });

  it("presents Quiz PDFs topic by topic: one grade choice, then every topic of that grade as a quiz card in topic order", () => {
    render(<PublicResourceLibrary kind="quizzes" library={{ taxonomy: quizTaxonomy, resources: grade6Quizzes }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Quiz PDFs" })).toBeTruthy();
    expect(screen.getByText("Grade → Topic")).toBeTruthy();
    expect(screen.getByText("Topic-by-topic math quizzes for practice, review, and assessment.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Choose a grade" })).toBeTruthy();
    // Only grades that actually have a published quiz are offered.
    const grade = screen.getByLabelText("Grade") as HTMLSelectElement;
    expect([...grade.options].map((option) => option.textContent)).toEqual(["Choose a grade", "Grade 6"]);
    expect(screen.queryByLabelText("Topic")).toBeNull();
    expect(screen.queryByLabelText("Lesson")).toBeNull();
    expect(screen.getByText("Choose a grade to see its quiz topics")).toBeTruthy();
    fireEvent.change(grade, { target: { value: "grade-6" } });
    expect(screen.getByRole("heading", { level: 2, name: "Quiz Topics" })).toBeTruthy();
    expect(screen.getByText("Grade 6 · 3 topics, one quiz PDF each.")).toBeTruthy();
    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => within(card).getByRole("heading", { level: 2 }).textContent)).toEqual([
      "Ratios And Rates Practice", "Understanding and Using Percent", "Positive Rational Numbers Practice"
    ]);
    expect(cards.map((card) => card.querySelector(".public-resource-path")?.textContent)).toEqual([
      "Grade 6 / Topic 1: Ratios and Rates", "Grade 6 / Topic 2: Understanding and Using Percent", "Grade 6 / Topic 3: Positive Rational Numbers"
    ]);
    for (const card of cards) {
      expect(within(card).getByText("Quiz PDF")).toBeTruthy();
      expect(within(card).getByText("Included in PDF")).toBeTruthy();
      expect(within(card).getByRole("link", { name: "Details" }).getAttribute("href")).toMatch(/^\/resources\/[0-9a-f-]{36}$/);
      expect(within(card).getByRole("link", { name: "Download PDF" }).getAttribute("href")).toMatch(/^\/resources\/[0-9a-f-]{36}\/download$/);
      expect(within(card).queryByRole("link", { name: "Answer key" })).toBeNull();
    }
    expect(within(cards[0]).getByRole("link", { name: "Download PDF" }).getAttribute("href")).toBe("/resources/20000000-0000-4000-8000-000000000001/download");
    // Topic-by-topic, never lesson-by-lesson: the shared taxonomy's lesson never surfaces here.
    expect(document.body.textContent).not.toMatch(/lesson/i);
  });

  it("tells an entitled visitor the truth when no quiz has been published", () => {
    render(<PublicResourceLibrary kind="quizzes" library={{ taxonomy: quizTaxonomy, resources: [] }} />);
    expect(screen.getByText("No published quizzes yet")).toBeTruthy();
    expect((screen.getByLabelText("Grade") as HTMLSelectElement).options).toHaveLength(1);
  });
});
