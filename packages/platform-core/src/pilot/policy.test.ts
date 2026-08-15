import { describe, expect, it } from "vitest";

import { createEmptyPilotChecklist, evaluatePilotPolicy, evaluatePilotReadiness, PILOT_CHECKLIST_KEYS } from "./policy";

describe("PilotPolicy", () => {
  it("defaults missing input to inactive", () => {
    expect(evaluatePilotPolicy(undefined)).toEqual({ readiness: "not-ready", activation: "inactive", activationAllowed: false, configuration: "missing", reasons: ["pilot_configuration_missing"] });
  });

  it.each([
    {},
    { readiness: true, activation: "inactive" },
    { readiness: "ready", activation: "inactive" },
    { readiness: "not-ready", activation: null }
  ])("fails closed for malformed input %#", (input) => {
    expect(evaluatePilotPolicy(input).activationAllowed).toBe(false);
    expect(evaluatePilotPolicy(input).activation).toBe("inactive");
  });

  it("distinguishes readiness from activation", () => {
    expect(evaluatePilotPolicy({ readiness: "ready-for-owner-decision", activation: "inactive" })).toEqual({
      readiness: "ready-for-owner-decision",
      activation: "inactive",
      activationAllowed: false,
      configuration: "valid",
      reasons: ["owner_activation_decision_required"]
    });
  });

  it("denies an unsupported activation request", () => {
    expect(evaluatePilotPolicy({ readiness: "ready-for-owner-decision", activation: "active" })).toEqual({
      readiness: "ready-for-owner-decision",
      activation: "inactive",
      activationAllowed: false,
      configuration: "unsupported",
      reasons: ["pilot_activation_not_authorized"]
    });
  });

  it("reports readiness only when every local checklist item is true", () => {
    const empty = createEmptyPilotChecklist();
    expect(evaluatePilotReadiness(empty).state).toBe("not-ready");
    const complete = Object.fromEntries(PILOT_CHECKLIST_KEYS.map((key) => [key, true]));
    expect(evaluatePilotReadiness(complete)).toEqual({ state: "ready-for-owner-decision", complete: [...PILOT_CHECKLIST_KEYS], incomplete: [] });
  });

  it("treats missing, unknown, and non-boolean checklist values as incomplete", () => {
    const evaluation = evaluatePilotReadiness({ governanceDocumented: true, injected: true, securityVerified: "yes" });
    expect(evaluation.complete).toEqual(["governanceDocumented"]);
    expect(evaluation.incomplete).toContain("securityVerified");
    expect(evaluation.state).toBe("not-ready");
  });
});
