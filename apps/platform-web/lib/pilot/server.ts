import "server-only";

import { evaluatePilotPolicy, type PilotPolicy } from "@math-vocabulary-hunt/platform-core";

export function getPilotPolicy(source: Readonly<Record<string, string | undefined>> = process.env): PilotPolicy {
  if (source.MVH_PILOT_READINESS === undefined && source.MVH_PILOT_ACTIVATION === undefined) return evaluatePilotPolicy(undefined);
  return evaluatePilotPolicy({
    readiness: source.MVH_PILOT_READINESS,
    activation: source.MVH_PILOT_ACTIVATION
  });
}
