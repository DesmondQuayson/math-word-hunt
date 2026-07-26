import { describe, expect, it } from "vitest";

import { parseTeacherProfile } from "./teacher-profile.js";

const profile = {
  teacherId: "teacher-1",
  displayName: "Ms. Rivera",
  organizationLabel: null,
  accountStatus: "active",
  createdAt: "2026-07-26T12:00:00Z",
  updatedAt: "2026-07-26T12:00:00Z"
};

describe("teacher profile contract", () => {
  it("accepts the minimized teacher profile", () => {
    expect(parseTeacherProfile(profile)).toMatchObject({ ok: true });
  });

  it("rejects malformed timestamps and unknown fields", () => {
    expect(parseTeacherProfile({ ...profile, updatedAt: "yesterday" })).toMatchObject({
      ok: false,
      error: { code: "validation", field: "updatedAt" }
    });
    expect(parseTeacherProfile({ ...profile, studentEmail: "student@example.com" })).toMatchObject({
      ok: false,
      error: { code: "validation" }
    });
  });
});
