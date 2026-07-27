import type { CapabilityDecision } from "@math-vocabulary-hunt/platform-core";

import { Notice } from "@/components/feedback/notice";
import { LinkButton } from "@/components/ui/link-button";
import { capabilityDecisionMessage } from "@/lib/capabilities/copy";

export function UpgradePrompt({ decision, title = "Current plan limit reached" }: Readonly<{ decision: CapabilityDecision; title?: string }>) {
  return <Notice label="Product access" tone="information" live>
    <strong>{title}</strong>
    <p>{capabilityDecisionMessage(decision)}</p>
    {decision.upgradeEligible ? <LinkButton href="/pricing" variant="secondary">Review Free and Teacher Pro</LinkButton> : null}
  </Notice>;
}
