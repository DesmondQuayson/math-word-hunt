import { describe, expect, it } from "vitest";

import { parseTeacherDashboard } from "./teacher-dashboard.js";

const dashboard = {
  teacherId: "teacher-1",
  activeClassCount: 2,
  draftActivityCount: 1,
  readyActivityCount: 2,
  activeSessionCount: 0,
  aggregateReportCount: 0,
  currentV7GameAvailable: true,
  generatedAt: "2026-07-26T13:00:00Z"
};

describe("teacher dashboard contract", () => {
  it("accepts minimal aggregate dashboard counts", () => {
    expect(parseTeacherDashboard(dashboard)).toMatchObject({ ok: true });
  });

  it("rejects fabricated negative counts and access strings", () => {
    expect(parseTeacherDashboard({ ...dashboard, activeClassCount: -1 })).toMatchObject({ ok: false });
    expect(parseTeacherDashboard({ ...dashboard, currentV7GameAvailable: "premium=true" })).toMatchObject({ ok: false });
  });
});
