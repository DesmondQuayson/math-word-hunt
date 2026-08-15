import type { ControlledPilotState, PilotActivationPolicy } from "@math-vocabulary-hunt/platform-core";

type PilotStatusCopy = Readonly<{ label: string; detail: string; tone: "neutral" | "attention" | "positive" }>;

const copy: Record<ControlledPilotState, PilotStatusCopy> = {
  inactive: { label: "Pilot inactive", detail: "Participation is not authorized.", tone: "neutral" },
  preparing: { label: "Pilot preparing", detail: "Required safeguards are still incomplete.", tone: "attention" },
  "ready-for-owner-decision": { label: "Ready for owner decision", detail: "Readiness does not grant access.", tone: "attention" },
  active: { label: "Controlled pilot active", detail: "Only approved adult teachers may participate.", tone: "positive" },
  paused: { label: "Pilot paused", detail: "Stop using the Preview until the owner reopens it.", tone: "attention" },
  ended: { label: "Pilot ended", detail: "Participation has closed; cleanup review is pending.", tone: "neutral" }
};

export function getPilotStatusCopy(policy: PilotActivationPolicy): PilotStatusCopy {
  return copy[policy.state];
}

export function formatPilotDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}
