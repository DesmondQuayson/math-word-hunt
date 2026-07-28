import Link from "next/link";

import { Notice } from "@/components/feedback/notice";
import { PilotShell } from "@/components/pilot/pilot-shell";

export const metadata = { title: "Pilot support and incidents" };

export default function PilotSupportPage() {
  return <PilotShell currentPath="/pilot/support">
    <header className="page-header"><p className="eyebrow">Pilot field guide · support</p><h1>Report the workflow, not the person.</h1><p className="lede">Contact the pilot coordinator using the channel through which pilot access was provided. No support address, 24/7 coverage, or response-time guarantee is approved.</p></header>
    <section className="pilot-support-card" aria-labelledby="support-include-heading"><div><span aria-hidden="true">+</span><h2 id="support-include-heading">Include</h2></div><ul><li>Workflow and reproducible steps</li><li>Approximate date and time</li><li>Device and browser category</li><li>Impact and expected/observed behavior</li><li>A safe correlation ID if the product displays one</li></ul></section>
    <section className="pilot-support-card pilot-support-card-stop" aria-labelledby="support-exclude-heading"><div><span aria-hidden="true">−</span><h2 id="support-exclude-heading">Do not include</h2></div><ul><li>Student information or sensitive school data</li><li>Passwords, tokens, cookies, secrets, or raw headers</li><li>Payment details or provider sessions</li><li>Screenshots, files, or raw form/authentication payloads</li></ul></section>
    <Notice label="Student data incident stop rule" tone="danger"><strong>Suspected student data means stop.</strong><p>Stop using the affected workflow, do not copy the information, log out if safe, and contact the pilot coordinator through the access channel. The account and Preview access may be restricted while the issue is reviewed.</p></Notice>
    <section aria-labelledby="support-account-heading"><h2 id="support-account-heading">Account or security issue</h2><p className="section-description">For suspected cross-account access, secret exposure, public Preview access, or inability to restrict an account, stop participation immediately. Preserve only sanitized facts and wait for the owner-approved incident path.</p><div className="button-row"><Link href="/pilot/feedback" className="text-link">Prepare a non-persistent feedback summary</Link><Link href="/pilot/exit" className="text-link">Review participation exit</Link></div></section>
  </PilotShell>;
}
