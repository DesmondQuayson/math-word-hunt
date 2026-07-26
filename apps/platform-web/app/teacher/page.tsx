import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { PreviewNotice } from "@/components/preview-notice";
import { getPlatformAccess } from "@/lib/adapters/entitlements";
import { getTeacherSession } from "@/lib/adapters/identity";

export const metadata = { title: "Teacher workspace" };

export default async function TeacherPage() {
  const [session, access] = await Promise.all([
    getTeacherSession(),
    getPlatformAccess()
  ]);

  return (
    <div className="shell page-stack">
      <PageHeading
        eyebrow="Workspace preview"
        title="A calm home base for teachers"
        description="This shell shows where classroom tools may live later. It does not authenticate teachers or save classroom information yet."
      />

      <PreviewNotice>
        <strong>Signed out</strong>
        <p>{session.message}</p>
      </PreviewNotice>

      <section className="workspace-grid" aria-labelledby="workspace-heading">
        <div className="section-heading workspace-title">
          <p className="eyebrow">Planned workspace</p>
          <h2 id="workspace-heading">Choose an area to preview</h2>
        </div>
        <article className="workspace-card">
          <span className="workspace-symbol" aria-hidden="true">Aa</span>
          <h3>Classes</h3>
          <p>See the intended empty state for future classroom organization.</p>
          <Link href="/teacher/classes">Preview classes</Link>
        </article>
        <article className="workspace-card">
          <span className="workspace-symbol" aria-hidden="true">∑</span>
          <h3>Reports</h3>
          <p>See how future reporting is separated from the current game.</p>
          <Link href="/teacher/reports">Preview reports</Link>
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
        <p
          className="access-state"
          data-access={access.features["premium-game-modes"] ? "allowed" : "denied"}
          data-testid="premium-access-state"
        >
          {access.features["premium-game-modes"] ? "Available" : "Not available"}
        </p>
      </section>
    </div>
  );
}
