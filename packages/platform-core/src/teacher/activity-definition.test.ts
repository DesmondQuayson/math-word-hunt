import { describe, expect, it } from "vitest";

import { parseActivityDefinition } from "./activity-definition.js";

const activity = {
  activityId: "activity-1",
  ownerTeacherId: "teacher-1",
  classId: null,
  grade: "7",
  topicId: "probability",
  lessonId: "g7-7-3",
  gameMode: "team-hunt",
  timeLimitMinutes: 20,
  teamCount: 4,
  combineMode: false,
  status: "ready",
  createdAt: "2026-07-26T12:00:00Z",
  updatedAt: "2026-07-26T12:00:00Z"
};

describe("activity definition contract", () => {
  it("accepts the approved structural activity fields", () => {
    expect(parseActivityDefinition(activity)).toMatchObject({ ok: true });
  });

  it("validates time, team count, and Combine Mode", () => {
    expect(parseActivityDefinition({ ...activity, timeLimitMinutes: 0 })).toMatchObject({
      ok: false,
      error: { field: "timeLimitMinutes" }
    });
    expect(parseActivityDefinition({ ...activity, teamCount: 20 })).toMatchObject({
      ok: false,
      error: { field: "teamCount" }
    });
    expect(parseActivityDefinition({ ...activity, combineMode: "yes" })).toMatchObject({
      ok: false,
      error: { field: "combineMode" }
    });
  });
});
