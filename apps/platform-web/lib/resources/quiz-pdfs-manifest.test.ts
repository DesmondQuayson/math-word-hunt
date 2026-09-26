// @vitest-environment node
import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import { buildQuizDescription, findPublicPdfs, loadQuizManifest, summarizeQuizManifest, verifyQuizFiles } from "../../../../scripts/quiz-pdfs/manifest.mjs";
import { matchExistingTopic, planGrade, planQuiz, planTopics, publicationSteps } from "../../../../scripts/quiz-pdfs/plan.mjs";

const manifest = loadQuizManifest();

describe("Quiz PDFs manifest (the owner's approved corpus)", () => {
  it("accounts for every uploaded quiz PDF, Grade 6 only, organized grade -> topic -> quiz", () => {
    expect(manifest.grades.map((grade) => grade.gradeNumber)).toEqual([6]);
    expect(manifest.quizzes).toHaveLength(8);
    const grade6 = manifest.grades[0];
    expect(grade6.topics.map((topic) => topic.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(grade6.topics.map((topic) => topic.title)).toEqual([
      "Ratios and Rates", "Understanding and Using Percent", "Positive Rational Numbers", "Integers and Rational Numbers",
      "Numeric and Algebraic Expressions", "Represent and Solve Equations", "Area Surface Area Volume", "Displaying Describing Summarising Data"
    ]);
    expect(manifest.quizzes.map((quiz) => quiz.sourceFile).sort()).toEqual([
      "Area Surface Area Volume Practice (1).pdf", "Displaying Describing Summarising Data (1).pdf", "Integers And Rational Numbers (1).pdf",
      "Numeric and Algebraic Expressions (1).pdf", "Positive Rational Numbers Practice (1).pdf", "Ratios And Rates Practice (1).pdf",
      "Represent and Solve Equations (1).pdf", "Understanding and Using Percent (1).pdf"
    ]);
  });

  it("stores each PDF byte-identical, structurally publishable and uniquely named", () => {
    const verification = verifyQuizFiles(manifest);
    expect(verification.results.filter((item) => !item.ok).map((item) => `${item.file}: ${item.findings.map((finding) => finding.code).join(",")}`)).toEqual([]);
    expect(verification.ok).toBe(true);
    for (const quiz of manifest.quizzes) {
      expect(basename(quiz.file)).toBe(quiz.downloadFilename);
      expect(quiz.downloadFilename).toBe(`grade-${quiz.gradeNumber}-${quiz.topicSlug}-quiz.pdf`);
      expect(quiz.answerKey).toBe("included");
      expect(quiz.description).toBe(buildQuizDescription(quiz.successCriteria));
      expect(quiz.tags).toContain("quiz");
      expect(quiz.tags).toContain(`grade-${quiz.gradeNumber}`);
    }
    expect(new Set(manifest.quizzes.map((quiz) => quiz.sha256)).size).toBe(8);
  });

  it("never names a lesson: Quiz PDFs are topic-by-topic", () => {
    for (const quiz of manifest.quizzes) {
      expect(quiz.topicTitle).not.toMatch(/lesson/i);
      expect(quiz.title).not.toMatch(/lesson/i);
      expect(quiz.description).not.toMatch(/lesson/i);
    }
  });

  it("serves no PDF from the public asset root (the entitlement-checked download route is the only path)", () => {
    expect(findPublicPdfs()).toEqual([]);
  });

  it("summarizes the corpus for the content audit without inventing counts", () => {
    const summary = summarizeQuizManifest(manifest);
    expect(summary).toMatchObject({ totalQuizzes: 8, answerKeysIncluded: 8, separateAnswerKeys: 0, withoutAnswerKey: 0 });
    expect(summary.grades[0]).toMatchObject({ gradeNumber: 6, count: 8 });
  });
});

describe("Quiz PDFs publication planning", () => {
  const topic = (id: string, slug: string, title: string, sortOrder: number, publicationState: "draft" | "published" = "published") =>
    ({ id, gradeId: "g6", slug, title, sortOrder, publicationState, lockVersion: 1 }) as const;

  it("reuses an owner's existing grade by number and appends new topics after the existing ones", () => {
    const grade = planGrade([{ id: "g6", gradeNumber: 6, title: "Grade 6", slug: "grade-six", sortOrder: 6, publicationState: "published", lockVersion: 3 }], manifest.grades[0]);
    expect(grade).toMatchObject({ action: "reuse", publish: false });
    const existing = [topic("t1", "ratios-and-rates", "Ratios and Rates", 1), topic("t2", "decimals", "Decimals", 2), topic("t3", "percent", "Understanding And Using Percent", 3, "draft")];
    const plans = planTopics(existing, manifest.grades[0].topics);
    expect(plans[0]).toMatchObject({ action: "reuse", sortOrder: 1, publish: false, existing: { id: "t1" } });
    // A title match ignores case and punctuation; an unpublished match is published rather than duplicated.
    expect(plans[1]).toMatchObject({ action: "reuse", sortOrder: 3, publish: true, existing: { id: "t3" } });
    expect(plans.slice(2).map((plan) => [plan.action, plan.sortOrder])).toEqual([["create", 4], ["create", 5], ["create", 6], ["create", 7], ["create", 8], ["create", 9]]);
  });

  it("keeps the manifest numbering for an empty grade and creates a missing grade after the taken sort orders", () => {
    expect(planTopics([], manifest.grades[0].topics).map((plan) => plan.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(planGrade([], manifest.grades[0])).toMatchObject({ action: "create", sortOrder: 6, publish: true });
    expect(planGrade([{ id: "x", gradeNumber: 3, title: "Grade 3", slug: "grade-3", sortOrder: 6, publicationState: "published", lockVersion: 1 }], manifest.grades[0])).toMatchObject({ action: "create", sortOrder: 7 });
    expect(planGrade([{ id: "x", gradeNumber: 3, title: "Grade 3", slug: "grade-6", sortOrder: 3, publicationState: "published", lockVersion: 1 }], manifest.grades[0])).toMatchObject({ action: "conflict" });
    expect(matchExistingTopic([], manifest.grades[0].topics[0])).toBeNull();
  });

  it("never overwrites: identical published quizzes are skipped, different ones are conflicts, accepted drafts are published", () => {
    const quiz = manifest.grades[0].topics[0].quiz;
    const base = { resourceId: "r1", slug: quiz.slug, sortOrder: 1, resourceType: "quiz_pdf", publicationState: "published", fileSha256: quiz.sha256, fileState: "accepted" } as const;
    expect(planQuiz([], quiz)).toMatchObject({ action: "create", sortOrder: 1 });
    expect(planQuiz([base], quiz)).toMatchObject({ action: "skip" });
    expect(planQuiz([{ ...base, fileSha256: "0".repeat(64) }], quiz)).toMatchObject({ action: "conflict", reason: "published-with-a-different-file" });
    expect(planQuiz([{ ...base, publicationState: "draft" }], quiz)).toMatchObject({ action: "publish" });
    expect(planQuiz([{ ...base, publicationState: "draft", fileState: null, fileSha256: null }], quiz)).toMatchObject({ action: "conflict" });
    expect(planQuiz([{ ...base, slug: "another-quiz" }], quiz)).toMatchObject({ action: "conflict", reason: "another-quiz-is-published-for-this-topic" });
    expect(planQuiz([{ ...base, slug: "another-quiz", publicationState: "draft" }], quiz)).toMatchObject({ action: "create", sortOrder: 2 });
    expect(publicationSteps("draft")).toEqual(["validating", "ready_for_review", "published"]);
    expect(publicationSteps("ready_for_review")).toEqual(["published"]);
    expect(() => publicationSteps("archived")).toThrow();
  });
});
