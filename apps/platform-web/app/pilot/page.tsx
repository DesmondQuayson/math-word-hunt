import Link from "next/link";

import { Notice } from "@/components/feedback/notice";
import { PilotOnboardingCheck } from "@/components/pilot/pilot-onboarding-check";
import { PilotReadinessPath } from "@/components/pilot/pilot-readiness-path";
import { PilotShell } from "@/components/pilot/pilot-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { formatPilotDate, getPilotStatusCopy } from "@/lib/pilot/copy";
import { getPilotPolicy } from "@/lib/pilot/server";

export const metadata = { title: "Restricted teacher pilot" };

export default function PilotPage() {
  const policy = getPilotPolicy();
  const status = getPilotStatusCopy(policy);
  const start = formatPilotDate(policy.startAt);
  const end = formatPilotDate(policy.endAt);
  return (
    <PilotShell currentPath="/pilot">
      <header className="pilot-hero">
        <div>
          <p className="eyebrow">Restricted Preview · {status.label}</p>
          <h1>Evaluate the teacher experience without bringing student data.</h1>
          <p className="lede">This protected experience supports a controlled pilot for three approved adult teachers, with an absolute maximum of five. It is never a public Production service.</p>
        </div>
        <div className="pilot-stamp" aria-label="Pilot activation status" data-pilot-state={policy.state}><span>Current state</span><strong>{status.label}</strong><small>{status.detail}</small></div>
      </header>

      <PilotReadinessPath />
      <Notice label="Non-negotiable pilot boundary" tone="warning"><strong>No student data.</strong><p>Do not enter student names, email addresses, IDs, rosters, work, grades, IEP information, behavioral records, or sensitive school data anywhere in the Preview.</p></Notice>
      <Notice label="Organization-name boundary" tone="warning"><strong>No real organization labels.</strong><p>Do not enter school, district, classroom, institution, or organization names. Profile writes are server-rejected and database-denied during this pilot.</p></Notice>

      <section className="pilot-window" aria-labelledby="pilot-status-heading" aria-live="polite">
        <div><p className="eyebrow">Controlled window</p><h2 id="pilot-status-heading">{status.label}</h2><p>{status.detail}</p></div>
        {start && end ? <dl><div><dt>Starts</dt><dd><time dateTime={policy.startAt ?? undefined}>{start}</time></dd></div><div><dt>Ends</dt><dd><time dateTime={policy.endAt ?? undefined}>{end}</time></dd></div></dl> : <p>Exact pilot dates have not been approved. Participation remains unavailable until dates and every operational prerequisite are complete.</p>}
      </section>

      <section aria-labelledby="pilot-evaluation-heading">
        <div className="section-heading-row"><div><p className="eyebrow">What this evaluates</p><h2 id="pilot-evaluation-heading">A small, bounded teacher workflow</h2></div></div>
        <div className="pilot-card-grid">
          <Card><h3>Teacher access</h3><p>Email/password sign-in, session restoration, teacher-only routes, and account restriction.</p></Card>
          <Card><h3>Planning</h3><p>Privacy-minimized class labels and activity drafts already supported—never rosters or student records.</p></Card>
          <Card><h3>Vocabulary gameplay</h3><p>The preserved canonical v7 game through the supported gateway, including keyboard and Pointer Events.</p></Card>
          <Card><h3>Readiness operations</h3><p>Clear support, non-persistent feedback, participation exit, fixture cleanup, and incident stop rules.</p></Card>
        </div>
      </section>

      <section className="pilot-boundary-ledger" aria-labelledby="pilot-boundaries-heading">
        <div><p className="eyebrow">Boundary ledger</p><h2 id="pilot-boundaries-heading">Know what is available—and what is not</h2><p>Unsupported features may change. Nothing on this page grants access or entitlement.</p></div>
        <div className="pilot-ledger-columns">
          <div><h3>May evaluate</h3><ul><li>Teacher authentication</li><li>Teacher-only planning</li><li>Canonical gameplay</li><li>Accessibility and usability</li><li>Support and exit instructions</li></ul></div>
          <div><h3>Must not use</h3><ul><li>Student participation or data</li><li>School, district, classroom, institution, or organization labels</li><li>Managed sessions or reports</li><li>Analytics or session replay</li><li>Billing, payment, or subscriptions</li><li>Production or public access</li></ul></div>
        </div>
      </section>

      <section aria-labelledby="pilot-before-heading"><h2 id="pilot-before-heading">Before any future participation</h2><p className="section-description">Read the privacy summary, understand support and exit options, then review the boundaries. The review stays only on this page.</p><div className="button-row"><LinkButton href="/pilot/privacy">Read privacy and data use</LinkButton><LinkButton href="/pilot/support" variant="secondary">Review support guidance</LinkButton></div><PilotOnboardingCheck /></section>
      <p className="pilot-footnote">Need to stop? <Link href="/pilot/exit">Review logout, restriction, and staged deletion instructions.</Link></p>
    </PilotShell>
  );
}
