import { describe, expect, it } from "vitest";

import { createIncompletePilotPrerequisites, evaluatePilotActivation, PILOT_ACTIVATION_PREREQUISITES } from "./activation";

const complete = Object.fromEntries(PILOT_ACTIVATION_PREREQUISITES.map((key) => [key, "complete"]));
const valid = {
  environment: "preview",
  requestedState: "active",
  startAt: "2026-09-01T14:00:00-05:00",
  endAt: "2026-09-22T14:00:00-05:00",
  emailDelivery: "transactional-verified",
  prerequisites: complete
} as const;

describe("controlled pilot activation", () => {
  it("defaults missing configuration to inactive", () => expect(evaluatePilotActivation(undefined)).toMatchObject({ state: "inactive", activationAllowed: false, configuration: "missing" }));
  it.each([
    { ...valid, requestedState: "launch" },
    { ...valid, prerequisites: { ...complete, injected: "complete" } },
    { ...valid, prerequisites: { ...complete, ownerGoRecorded: true } },
    { ...valid, startAt: "tomorrow" }
  ])("fails closed for malformed configuration %#", (input) => expect(evaluatePilotActivation(input).activationAllowed).toBe(false));
  it.each([
    { ...valid, startAt: "tomorrow" },
    { ...valid, endAt: "2026-08-01T14:00:00-05:00" },
    { ...valid, emailDelivery: "verified" }
  ])("normalizes malformed active configuration to inactive %#", (input) => {
    expect(evaluatePilotActivation(input)).toMatchObject({ state: "inactive", activationAllowed: false, configuration: "malformed" });
  });
  it("treats missing dates as incomplete without fabricating them", () => {
    const result = evaluatePilotActivation({ ...valid, startAt: undefined, endAt: undefined });
    expect(result).toMatchObject({ state: "preparing", activationAllowed: false, configuration: "incomplete", startAt: null, endAt: null });
    expect(result.missingPrerequisites).toContain("datesApproved");
  });
  it.each(["production", "staging", undefined])("denies unsupported environment %j", (environment) => {
    expect(evaluatePilotActivation({ ...valid, environment })).toMatchObject({ state: "inactive", activationAllowed: false, configuration: "unsupported" });
  });
  it.each(PILOT_ACTIVATION_PREREQUISITES)("denies activation when %s is incomplete", (key) => {
    const result = evaluatePilotActivation({ ...valid, prerequisites: { ...complete, [key]: "incomplete" } });
    expect(result.activationAllowed).toBe(false);
    expect(result.missingPrerequisites).toContain(key);
  });
  it("requires verified transactional Auth email independently of the checklist", () => {
    const result = evaluatePilotActivation({ ...valid, emailDelivery: "transactional-configured" });
    expect(result.activationAllowed).toBe(false);
    expect(result.missingPrerequisites).toContain("transactionalAuthEmailVerified");
  });
  it("keeps readiness separate from owner GO and activation", () => {
    const result = evaluatePilotActivation({ ...valid, prerequisites: { ...complete, ownerGoRecorded: "incomplete" } });
    expect(result).toMatchObject({ state: "ready-for-owner-decision", readiness: "ready-for-owner-decision", activationAllowed: false });
  });
  it("activates only a complete, valid Preview contract", () => expect(evaluatePilotActivation(valid)).toMatchObject({ state: "active", activationAllowed: true, configuration: "valid" }));
  it.each(["inactive", "preparing", "ready-for-owner-decision", "paused", "ended"] as const)("never activates the %s state", (requestedState) => {
    expect(evaluatePilotActivation({ ...valid, requestedState }).activationAllowed).toBe(false);
  });
  it("creates a complete fail-closed prerequisite shape", () => {
    expect(Object.values(createIncompletePilotPrerequisites()).every((value) => value === "incomplete")).toBe(true);
  });
});
