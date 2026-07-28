import Link from "next/link";

export function PilotStatusBanner() {
  return (
    <aside className="pilot-status-banner" aria-label="Restricted pilot status">
      <strong>Pilot inactive</strong>
      <span>Restricted test environment</span>
      <span>Adult teachers only</span>
      <span>No student data</span>
      <span>No billing</span>
      <Link href="/pilot">Read the pilot boundaries</Link>
    </aside>
  );
}
