import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getTeacherSession } from "@/lib/adapters/identity";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";

export const metadata = { title: "Account prototype" };

export default async function AccountPage() {
  const session = await getTeacherSession();
  const prototype = getTeacherPrototypeState();

  return (
    <TeacherShell currentPath="/account">
      <PageHeader
        eyebrow="Teacher workspace · Account"
        title="A future teacher account, with clear boundaries"
        description="Teacher-only identity, password security, profile control, and deletion requests will require a trusted backend and a separate security phase."
      />

      {prototype.enabled ? (
        <>
          <PrototypeDataNotice />
          <section aria-labelledby="profile-structure-heading" data-prototype-fixture="account-structure">
            <SectionHeader eyebrow="Demonstration structure" title="Profile information" id="profile-structure-heading" compact />
            <dl className="definition-grid">
              <div><dt>Display name</dt><dd>{prototype.data.teacherLabel}</dd></div>
              <div><dt>Role</dt><dd>Teacher</dd></div>
              <div><dt>Account status</dt><dd>Demonstration only</dd></div>
              <div><dt>Subscription</dt><dd>Deliberately deferred</dd></div>
            </dl>
          </section>
        </>
      ) : (
        <>
          <Notice label="Teacher account status" tone="information">
            <strong>Signed out</strong>
            <p>{session.message}</p>
          </Notice>
          <EmptyState
            symbol="ID"
            headingId="account-empty-heading"
            title="No profile has been created"
            description="This production-default preview has no sign-up, login, saved profile, plan, subscription, pricing, or customer portal."
            action={<LinkButton href="/play">Play without an account</LinkButton>}
          />
        </>
      )}

      <section aria-labelledby="account-controls-heading">
        <SectionHeader eyebrow="Future account controls" title="Security and lifecycle" id="account-controls-heading" compact />
        <div className="account-control-grid">
          <Card><h3>Profile</h3><p>Display name and teacher-owned preferences only after identity exists.</p></Card>
          <Card><h3>Password and security</h3><p>Email verification, recovery, session review, and secure password changes.</p></Card>
          <Card><h3>Deletion request</h3><p>A soft, reversible request boundary before any future approved permanent deletion.</p></Card>
          <Card variant="muted"><h3>Subscription</h3><p>Plans, pricing, billing, and customer-portal behavior are deliberately deferred.</p></Card>
        </div>
      </section>

      <Notice label="Data minimization principles" tone="success">
        <strong>Collect less by design.</strong>
        <p>No student accounts, no student names required for team play, and no browser value treated as account authority.</p>
      </Notice>
    </TeacherShell>
  );
}
