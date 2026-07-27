import type { CapabilityDecision } from "@math-vocabulary-hunt/platform-core";
import type { ReactNode } from "react";

export function CapabilityBoundary({ decision, children, fallback }: Readonly<{ decision: CapabilityDecision; children: ReactNode; fallback: ReactNode }>) {
  return decision.allowed ? children : fallback;
}
