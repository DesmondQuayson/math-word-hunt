import { describe, expect, it } from "vitest";

import { parseCurriculumSummary } from "./curriculum-summary.js";

const summary = {
  curriculumId: "mvh-v7",
  availableGrades: ["6", "7", "8"],
  termCount: 506,
  playableLessonCount: 170,
  missingLessonCount: 8,
  thinLessonCount: 13,
  unresolvedReferenceCount: 0,
  teacherReviewComplete: false,
  statuses: ["ready", "thin", "coming-soon", "review-pending"]
};

describe("curriculum summary contract", () => {
  it("accepts the canonical documented counts", () => {
    expect(parseCurriculumSummary(summary)).toMatchObject({ ok: true });
  });

  it("rejects duplicate grades and unsupported statuses", () => {
    expect(parseCurriculumSummary({ ...summary, availableGrades: ["7", "7"] })).toMatchObject({ ok: false });
    expect(parseCurriculumSummary({ ...summary, statuses: ["expert-approved"] })).toMatchObject({ ok: false });
  });
});
