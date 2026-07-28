import { describe, expect, it } from "vitest";

import { createSyntheticPilotFixture, verifySyntheticFixtureCleanup } from "./fixtures";

describe("synthetic pilot fixtures", () => {
  it("creates two generic, non-personal fixture references", () => {
    const fixture = createSyntheticPilotFixture("pilotrun-1234");
    expect(fixture?.teacherRefs).toEqual(["pilotrun-1234-teacher-a", "pilotrun-1234-teacher-b"]);
    expect(JSON.stringify(fixture)).not.toMatch(/@|student|password|token/i);
  });

  it.each(["short", "Pilot_Run", "participant@example.test", "pilot run 123"])("rejects unsafe run ID %s", (runId) => {
    expect(createSyntheticPilotFixture(runId)).toBeNull();
  });

  it("requires every fixture category to return to zero", () => {
    const zero = { authUsers: 0, profiles: 0, classes: 0, activities: 0, entitlements: 0, deletionRequests: 0, billingRecords: 0 };
    expect(verifySyntheticFixtureCleanup(zero)).toEqual({ clean: true, remaining: [] });
    expect(verifySyntheticFixtureCleanup({ ...zero, classes: 1 })).toEqual({ clean: false, remaining: ["classes"] });
    expect(verifySyntheticFixtureCleanup({})).toEqual({ clean: false, remaining: ["authUsers", "profiles", "classes", "activities", "entitlements", "deletionRequests", "billingRecords"] });
  });
});
