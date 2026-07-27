import type { CapabilityDecision, CapabilityKey } from "@math-vocabulary-hunt/platform-core";

import { StatusBadge } from "@/components/ui/status-badge";

export function FeatureAvailabilityBadge({ capabilityKey, decision }: Readonly<{ capabilityKey: CapabilityKey; decision: CapabilityDecision }>) {
  const label = decision.allowed ? "Available" : decision.reason === "denied_unavailable" ? "Not available yet" : decision.reason === "denied_limit_reached" ? "Limit reached" : "Unavailable";
  return <StatusBadge tone={decision.allowed ? "success" : decision.reason === "denied_unavailable" ? "neutral" : "warning"} data-capability={capabilityKey} data-decision={decision.reason}>{label}</StatusBadge>;
}
