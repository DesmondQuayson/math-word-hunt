export const PILOT_READINESS_STATES = ["not-ready", "ready-for-owner-decision"] as const;
export type PilotReadinessState = (typeof PILOT_READINESS_STATES)[number];

export const PILOT_CHECKLIST_KEYS = [
  "governanceDocumented",
  "privacyDraftReviewed",
  "supportOperationsDocumented",
  "phase6VerificationPassed",
  "accessibilityVerified",
  "securityVerified",
  "syntheticCleanupVerified"
] as const;
export type PilotChecklistKey = (typeof PILOT_CHECKLIST_KEYS)[number];
export type PilotChecklist = Readonly<Record<PilotChecklistKey, boolean>>;

export type PilotReadinessEvaluation = Readonly<{
  state: PilotReadinessState;
  complete: readonly PilotChecklistKey[];
  incomplete: readonly PilotChecklistKey[];
}>;

export type PilotPolicy = Readonly<{
  readiness: PilotReadinessState;
  activation: "inactive";
  activationAllowed: false;
  configuration: "valid" | "missing" | "malformed" | "unsupported";
  reasons: readonly string[];
}>;

export type PilotPolicyInput = Readonly<{
  readiness?: unknown;
  activation?: unknown;
}>;

export function createEmptyPilotChecklist(): PilotChecklist {
  return Object.freeze(Object.fromEntries(PILOT_CHECKLIST_KEYS.map((key) => [key, false])) as Record<PilotChecklistKey, boolean>);
}

export function evaluatePilotReadiness(value: unknown): PilotReadinessEvaluation {
  const checklist = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const complete: PilotChecklistKey[] = [];
  const incomplete: PilotChecklistKey[] = [];
  for (const key of PILOT_CHECKLIST_KEYS) {
    if (checklist[key] === true) complete.push(key);
    else incomplete.push(key);
  }
  return Object.freeze({
    state: incomplete.length === 0 ? "ready-for-owner-decision" : "not-ready",
    complete: Object.freeze(complete),
    incomplete: Object.freeze(incomplete)
  });
}

function inactive(configuration: PilotPolicy["configuration"], reasons: readonly string[], readiness: PilotReadinessState = "not-ready"): PilotPolicy {
  return Object.freeze({ readiness, activation: "inactive", activationAllowed: false, configuration, reasons: Object.freeze([...reasons]) });
}

export function evaluatePilotPolicy(input: PilotPolicyInput | null | undefined): PilotPolicy {
  if (input == null) return inactive("missing", ["pilot_configuration_missing"]);
  if (typeof input.readiness !== "string" || typeof input.activation !== "string") return inactive("malformed", ["pilot_configuration_malformed"]);
  if (!PILOT_READINESS_STATES.includes(input.readiness as PilotReadinessState)) return inactive("malformed", ["pilot_readiness_unknown"]);
  if (input.activation !== "inactive") return inactive("unsupported", ["pilot_activation_not_authorized"], input.readiness as PilotReadinessState);
  return inactive("valid", [input.readiness === "ready-for-owner-decision" ? "owner_activation_decision_required" : "pilot_not_ready"], input.readiness as PilotReadinessState);
}
