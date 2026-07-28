import { createSafeEvent, type SafeEvent } from "../observability/events";

export const PILOT_EVENT_CODES = [
  "pilot.readiness.evaluated",
  "pilot.access.denied",
  "pilot.fixture.created",
  "pilot.fixture.cleaned",
  "pilot.account.restricted",
  "pilot.incident.stop"
] as const;
export type PilotEventCode = (typeof PILOT_EVENT_CODES)[number];

export type PilotRouteCategory = "onboarding" | "privacy" | "support" | "feedback" | "exit" | "teacher" | "game-gateway";
export type PilotEnvironmentClass = "local" | "preview" | "unknown";

export function parsePilotCorrelationId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : null;
}

export function createPilotEvent(input: Readonly<{
  code: PilotEventCode;
  correlationId: string;
  result: "allowed" | "denied" | "complete" | "incomplete" | "stopped";
  route: PilotRouteCategory;
  environment: PilotEnvironmentClass;
  severity?: SafeEvent["severity"];
}>): SafeEvent | null {
  if (!PILOT_EVENT_CODES.includes(input.code) || !parsePilotCorrelationId(input.correlationId)) return null;
  return createSafeEvent({
    category: "pilot",
    severity: input.severity ?? "info",
    code: input.code,
    correlationId: input.correlationId,
    detail: { result: input.result, route: input.route, environment: input.environment }
  });
}
