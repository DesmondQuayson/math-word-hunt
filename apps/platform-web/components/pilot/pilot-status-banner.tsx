import Link from "next/link";
import { getPilotPolicy } from "@/lib/pilot/server";

export function PilotStatusBanner() {
  const policy = getPilotPolicy();
  return (
    <aside className="pilot-status-banner" aria-label="Restricted pilot status" data-pilot-readiness={policy.readiness} data-pilot-activation={policy.activation}>
      <strong>Pilot inactive</strong>
      <span>Restricted test environment</span>
      <span>Adult teachers only</span>
      <span>No student data</span>
      <span>No billing</span>
      <Link href="/pilot">Read the pilot boundaries</Link>
    </aside>
  );
}
