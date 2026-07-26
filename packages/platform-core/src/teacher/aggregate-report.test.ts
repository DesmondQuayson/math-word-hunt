import { describe, expect, it } from "vitest";

import { parseAggregateReport } from "./aggregate-report.js";

const report = {
  reportId: "report-1",
  ownerTeacherId: "teacher-1",
  classId: "class-1",
  activityId: "activity-1",
  sessionId: null,
  aggregateSessionCount: 2,
  aggregateTeamCount: 8,
  lessonResults: [{
    lessonId: "g7-7-3",
    lessonLabel: "Understand Experimental Probability",
    aggregateCorrectPercent: 82,
    reviewCategory: "continue-practice"
  }],
  vocabularyCategories: [{ termId: "outcome", termLabel: "Outcome", category: "strength" }],
  generatedAt: "2026-07-26T13:00:00Z"
};

describe("aggregate report contract", () => {
  it("accepts aggregate lesson and vocabulary categories", () => {
    expect(parseAggregateReport(report)).toMatchObject({ ok: true });
  });

  it("rejects percentages outside 0 to 100", () => {
    expect(parseAggregateReport({
      ...report,
      lessonResults: [{ ...report.lessonResults[0], aggregateCorrectPercent: 101 }]
    })).toMatchObject({ ok: false });
  });

  it("rejects individual and predictive fields", () => {
    expect(parseAggregateReport({ ...report, studentScores: [] })).toMatchObject({ ok: false });
    expect(parseAggregateReport({ ...report, predictedAbility: "advanced" })).toMatchObject({ ok: false });
  });
});
