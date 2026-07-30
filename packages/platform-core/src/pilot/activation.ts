import { isTransactionalAuthEmailVerified, parseAuthEmailDeliveryState, type AuthEmailDeliveryState } from "../email/delivery-state";

export const CONTROLLED_PILOT_STATES = [
  "inactive",
  "preparing",
  "ready-for-owner-decision",
  "active",
  "paused",
  "ended"
] as const;
export type ControlledPilotState = (typeof CONTROLLED_PILOT_STATES)[number];

export const PILOT_ACTIVATION_PREREQUISITES = [
  "ownerGoRecorded",
  "datesApproved",
  "supportChannelApproved",
  "transactionalAuthEmailVerified",
  "confirmationFlowVerified",
  "recoveryFlowVerified",
  "humanPreviewAccessApproved",
  "privacyPolicyApproved",
  "incidentOperatorAssigned",
  "rollbackOperatorAssigned"
] as const;
export type PilotActivationPrerequisite = (typeof PILOT_ACTIVATION_PREREQUISITES)[number];
export type PilotPrerequisiteState = "complete" | "incomplete";
export type PilotActivationPrerequisites = Readonly<Record<PilotActivationPrerequisite, PilotPrerequisiteState>>;

export type PilotActivationInput = Readonly<{
  environment?: unknown;
  requestedState?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  emailDelivery?: unknown;
  prerequisites?: unknown;
}>;

export type PilotActivationPolicy = Readonly<{
  state: ControlledPilotState;
  requestedState: ControlledPilotState | null;
  readiness: "not-ready" | "ready-for-owner-decision";
  activationAllowed: boolean;
  configuration: "valid" | "missing" | "malformed" | "unsupported" | "incomplete";
  missingPrerequisites: readonly PilotActivationPrerequisite[];
  reasons: readonly string[];
  startAt: string | null;
  endAt: string | null;
  emailDelivery: AuthEmailDeliveryState;
}>;

const READINESS_PREREQUISITES = PILOT_ACTIVATION_PREREQUISITES.filter((key) => key !== "ownerGoRecorded");

function inactive(
  configuration: PilotActivationPolicy["configuration"],
  reasons: readonly string[],
  requestedState: ControlledPilotState | null = null,
  missingPrerequisites: readonly PilotActivationPrerequisite[] = PILOT_ACTIVATION_PREREQUISITES
): PilotActivationPolicy {
  return Object.freeze({
    state: "inactive",
    requestedState,
    readiness: "not-ready",
    activationAllowed: false,
    configuration,
    missingPrerequisites: Object.freeze([...missingPrerequisites]),
    reasons: Object.freeze([...reasons]),
    startAt: null,
    endAt: null,
    emailDelivery: "disabled"
  });
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parsePrerequisites(value: unknown): PilotActivationPrerequisites | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !PILOT_ACTIVATION_PREREQUISITES.includes(key as PilotActivationPrerequisite))) return null;
  const parsed = {} as Record<PilotActivationPrerequisite, PilotPrerequisiteState>;
  for (const key of PILOT_ACTIVATION_PREREQUISITES) {
    if (record[key] === undefined) parsed[key] = "incomplete";
    else if (record[key] === "complete" || record[key] === "incomplete") parsed[key] = record[key];
    else return null;
  }
  return Object.freeze(parsed);
}

export function createIncompletePilotPrerequisites(): PilotActivationPrerequisites {
  return Object.freeze(Object.fromEntries(PILOT_ACTIVATION_PREREQUISITES.map((key) => [key, "incomplete"])) as Record<PilotActivationPrerequisite, PilotPrerequisiteState>);
}

export function evaluatePilotActivation(input: PilotActivationInput | null | undefined): PilotActivationPolicy {
  if (input == null) return inactive("missing", ["pilot_activation_configuration_missing"]);
  if (typeof input.requestedState !== "string" || !CONTROLLED_PILOT_STATES.includes(input.requestedState as ControlledPilotState)) {
    return inactive("malformed", ["pilot_state_unknown"]);
  }
  const requestedState = input.requestedState as ControlledPilotState;
  if (input.environment !== "local" && input.environment !== "preview") {
    return inactive("unsupported", ["pilot_environment_unsupported"], requestedState);
  }
  const prerequisites = parsePrerequisites(input.prerequisites);
  if (!prerequisites) return inactive("malformed", ["pilot_prerequisites_malformed"], requestedState);
  const startAt = parseDate(input.startAt);
  const endAt = parseDate(input.endAt);
  const startSupplied = typeof input.startAt === "string" && input.startAt.trim().length > 0;
  const endSupplied = typeof input.endAt === "string" && input.endAt.trim().length > 0;
  if ((startSupplied && !startAt) || (endSupplied && !endAt) || (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt))) {
    return inactive("malformed", ["pilot_dates_malformed"], requestedState);
  }
  const parsedEmailDelivery = parseAuthEmailDeliveryState(input.emailDelivery);
  if (input.emailDelivery !== undefined && !parsedEmailDelivery) return inactive("malformed", ["pilot_email_state_unknown"], requestedState);
  const emailDelivery: AuthEmailDeliveryState = parsedEmailDelivery ?? "disabled";
  const missing = PILOT_ACTIVATION_PREREQUISITES.filter((key) => prerequisites[key] !== "complete");
  if (!startAt || !endAt) {
    if (!missing.includes("datesApproved")) missing.push("datesApproved");
  }
  if (!isTransactionalAuthEmailVerified(emailDelivery) && !missing.includes("transactionalAuthEmailVerified")) {
    missing.push("transactionalAuthEmailVerified");
  }
  const readinessMissing = READINESS_PREREQUISITES.filter((key) => missing.includes(key));
  const readiness = readinessMissing.length === 0 ? "ready-for-owner-decision" : "not-ready";
  const base = {
    requestedState,
    readiness,
    activationAllowed: false,
    missingPrerequisites: Object.freeze([...missing]),
    startAt,
    endAt,
    emailDelivery
  } as const;

  if (requestedState === "inactive") return Object.freeze({ ...base, state: "inactive", configuration: "valid", reasons: Object.freeze(["pilot_inactive_by_configuration"]) });
  if (requestedState === "paused" || requestedState === "ended") {
    return Object.freeze({ ...base, state: requestedState, configuration: "valid", reasons: Object.freeze([`pilot_${requestedState}`]) });
  }
  if (missing.length > 0) {
    const state: ControlledPilotState = readiness === "ready-for-owner-decision" ? "ready-for-owner-decision" : "preparing";
    return Object.freeze({ ...base, state, configuration: "incomplete", reasons: Object.freeze(missing.map((key) => `pilot_prerequisite_missing:${key}`)) });
  }
  if (requestedState === "preparing") return Object.freeze({ ...base, state: "preparing", configuration: "valid", reasons: Object.freeze(["pilot_preparing"]) });
  if (requestedState === "ready-for-owner-decision") return Object.freeze({ ...base, state: "ready-for-owner-decision", configuration: "valid", reasons: Object.freeze(["owner_activation_decision_required"]) });
  return Object.freeze({ ...base, state: "active", activationAllowed: true, configuration: "valid", reasons: Object.freeze(["pilot_activation_authorized"]) });
}
