import Link from "next/link";

import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPlatformAccess } from "@/lib/adapters/entitlements";
import { getTeacherSession } from "@/lib/adapters/identity";

export const metadata = { title: "Teacher workspace" };

export default async function TeacherPage() {
  const [session, access] = await Promise.all([
    getTeacherSession(),
    getPlatformAccess()
  ]);
  const premiumAvailable = access.features["premium-game-modes"];

  return (
    <TeacherShell currentPath="/teacher">
      <PageHeader
        eyebrow="Workspace preview"
        title="A calm home base for teachers"
        description="This shell shows where classroom tools may live later. It does not authenticate teachers or save classroom information yet."
      />

      <Notice label="Teacher session status" tone="information">
        <strong>Signed out</strong>
        <p>{session.message}</p>
      </Notice>

      <section className="workspace-grid" aria-labelledby="workspace-heading">
        <SectionHeader
          eyebrow="Planned workspace"
          title="Choose an area to preview"
          id="workspace-heading"
          className="workspace-title"
        />
        <article>
          <Card variant="interactive" className="workspace-card">
            <span className="workspace-symbol" aria-hidden="true">Aa</span>
            <h3>Classes</h3>
            <p>See the intended empty state for future classroom organization.</p>
            <Link href="/teacher/classes">Preview classes</Link>
          </Card>
        </article>
        <article>
          <Card variant="interactive" className="workspace-card">
            <span className="workspace-symbol" aria-hidden="true">∑</span>
            <h3>Reports</h3>
            <p>See how future reporting is separated from the current game.</p>
            <Link href="/teacher/reports">Preview reports</Link>
          </Card>
        </article>
      </section>

      <section className="access-panel" aria-labelledby="access-heading">
        <div>
          <p className="card-kicker">Server policy preview</p>
          <h2 id="access-heading">Premium access</h2>
          <p>
            Access remains denied until a future trusted server verifies an
            authenticated teacher and an effective entitlement.
          </p>
        </div>
        <StatusBadge
          tone={premiumAvailable ? "success" : "neutral"}
          className="access-state"
          data-access={premiumAvailable ? "allowed" : "denied"}
          data-testid="premium-access-state"
        >
          {premiumAvailable ? "Available" : "Not available"}
        </StatusBadge>
      </section>
    </TeacherShell>
  );
}
