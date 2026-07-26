import { describe, expect, it } from "vitest";

import { parseSessionRecord } from "./session-record.js";

const session = {
  sessionId: "session-1",
  ownerTeacherId: "teacher-1",
  activityId: "activity-1",
  classId: "class-1",
  status: "completed",
  teamCount: 4,
  termsReviewed: 18,
  aggregateResponseCount: 72,
  startedAt: "2026-07-26T12:05:00Z",
  completedAt: "2026-07-26T12:25:00Z",
  createdAt: "2026-07-26T12:00:00Z",
  updatedAt: "2026-07-26T12:25:00Z"
};

describe("session record contract", () => {
  it("accepts aggregate-only session metadata", () => {
    expect(parseSessionRecord(session)).toMatchObject({ ok: true });
  });

  it("requires completion evidence for completed status", () => {
    expect(parseSessionRecord({ ...session, completedAt: null })).toMatchObject({
      ok: false,
      error: { field: "completedAt" }
    });
  });

  it("rejects individual participant information", () => {
    expect(parseSessionRecord({ ...session, studentIds: ["student-1"] })).toMatchObject({ ok: false });
  });
});
