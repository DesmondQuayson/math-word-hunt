import Link from "next/link";
import { getPilotStatusCopy } from "@/lib/pilot/copy";
import { getPilotPolicy } from "@/lib/pilot/server";

export function PilotStatusBanner() {
  const policy = getPilotPolicy();
  const status = getPilotStatusCopy(policy);
  return (
    <aside className="pilot-status-banner" aria-label="Restricted pilot status" aria-live="polite" data-pilot-state={policy.state} data-pilot-readiness={policy.readiness} data-pilot-activation={policy.activationAllowed ? "active" : "inactive"} data-pilot-tone={status.tone}>
      <strong>{status.label}</strong>
      <span>{status.detail}</span>
      <span>Restricted test environment</span>
      <span>Adult teachers only</span>
      <span>No student data</span>
      <span>No organization labels</span>
      <span>No billing</span>
      <Link href="/pilot">Read the pilot boundaries</Link>
    </aside>
  );
}
