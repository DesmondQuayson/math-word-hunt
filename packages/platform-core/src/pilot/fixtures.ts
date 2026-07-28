const fixtureKeys = ["authUsers", "profiles", "classes", "activities", "entitlements", "deletionRequests", "billingRecords"] as const;
export type SyntheticFixtureCounts = Readonly<Record<(typeof fixtureKeys)[number], number>>;

export type SyntheticPilotFixture = Readonly<{
  runId: string;
  teacherRefs: readonly [string, string];
  classRefs: readonly [string, string];
  activityRefs: readonly [string, string];
}>;

export function createSyntheticPilotFixture(runId: string): SyntheticPilotFixture | null {
  if (!/^[a-z0-9][a-z0-9-]{7,39}$/.test(runId)) return null;
  return Object.freeze({
    runId,
    teacherRefs: Object.freeze([`${runId}-teacher-a`, `${runId}-teacher-b`] as const),
    classRefs: Object.freeze([`${runId}-class-a`, `${runId}-class-b`] as const),
    activityRefs: Object.freeze([`${runId}-activity-a`, `${runId}-activity-b`] as const)
  });
}

export function verifySyntheticFixtureCleanup(value: unknown): Readonly<{ clean: boolean; remaining: readonly string[] }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({ clean: false, remaining: Object.freeze([...fixtureKeys]) });
  const counts = value as Record<string, unknown>;
  const remaining = fixtureKeys.filter((key) => !Number.isSafeInteger(counts[key]) || Number(counts[key]) !== 0);
  return Object.freeze({ clean: remaining.length === 0, remaining: Object.freeze(remaining) });
}
