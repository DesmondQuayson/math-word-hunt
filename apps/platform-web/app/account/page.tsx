import { signOutAction } from "@/app/auth-actions";
import { EmptyState } from "@/components/feedback/empty-state";
import { Notice } from "@/components/feedback/notice";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { DeletionRequestForm, ProfileForm } from "@/components/forms/teacher-data-forms";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getPlatformAccess } from "@/lib/adapters/entitlements";
import { getTeacherSession } from "@/lib/adapters/identity";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";
import { createServerRepositories } from "@/lib/repositories/server-repositories";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";

export const metadata = { title: "Teacher account" };

export default async function AccountPage() {
  const prototype = getTeacherPrototypeState();
  const configured = isSupabaseConfigured();
  const [session, access] = await Promise.all([getTeacherSession(), getPlatformAccess()]);
  const repositories = session.teacher ? await createServerRepositories() : null;
  const deletion = repositories && session.teacher ? await repositories.deletionRequests.getOpen(session.teacher.userId) : null;
  const profile = session.teacher?.profile;

  return <TeacherShell currentPath="/account" accountNote={profile ? "Local teacher account controls are enabled. Billing remains unavailable." : undefined}>
    <PageHeader eyebrow="Teacher workspace · Account" title={profile ? "Your teacher account" : configured ? "Teacher account" : "A future teacher account, with clear boundaries"} description={profile ? "Manage the approved profile fields and account lifecycle for this local teacher account." : configured ? "Local teacher authentication is being validated without changing the standalone v7 game." : "Teacher profiles, password controls, and deletion requests are planned, but account setup and security tools are not available in this preview."} />
    {prototype.enabled ? <><PrototypeDataNotice /><section aria-labelledby="profile-structure-heading" data-prototype-fixture="account-structure"><SectionHeader eyebrow="Demonstration structure" title="Profile information" id="profile-structure-heading" compact /><dl className="definition-grid"><div><dt>Display name</dt><dd>{prototype.data.teacherLabel}</dd></div><div><dt>Role</dt><dd>Teacher</dd></div><div><dt>Account status</dt><dd>Demonstration only</dd></div><div><dt>Subscription</dt><dd>Deliberately deferred</dd></div></dl></section></> : profile ? <>
      <Notice label="Teacher account status" tone={session.status === "active" ? "success" : "warning"}><strong>{session.status === "active" ? "Active local account" : session.status === "suspended" ? "Account suspended" : "Deletion requested"}</strong><p>{session.message}</p></Notice>
      <dl className="definition-grid" data-testid="real-account-summary"><div><dt>Email</dt><dd>{session.teacher?.email ?? "Unavailable"}</dd></div><div><dt>Role</dt><dd>Teacher</dd></div><div><dt>Account status</dt><dd>{profile.accountStatus}</dd></div><div><dt>Premium entitlement</dt><dd>{access.productAccess ? "Available" : "Not available"}</dd></div></dl>
      {session.status === "active" ? <section aria-labelledby="profile-edit-heading"><SectionHeader eyebrow="Approved profile fields" title="Profile" id="profile-edit-heading" compact /><ProfileForm displayName={profile.displayName} schoolLabel={profile.organizationLabel ?? ""} /></section> : null}
      <section aria-labelledby="deletion-heading"><SectionHeader eyebrow="Account lifecycle" title="Deletion request" id="deletion-heading" compact />{deletion?.ok || session.status === "deletion-requested" ? <Notice label="Deletion request" tone="warning"><strong>Request pending</strong><p>No account data has been permanently deleted. New class and activity writes are restricted.</p></Notice> : session.status === "active" ? <DeletionRequestForm /> : <p>This account cannot create another deletion request.</p>}</section>
      <form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form>
    </> : <><Notice label="Teacher account status" tone={session.status === "missing-profile" ? "warning" : "information"}><strong>{session.status === "missing-profile" ? "Profile unavailable" : "Signed out"}</strong><p>{session.message}</p></Notice><EmptyState symbol="ID" headingId="account-empty-heading" title={!configured ? "No profile has been created" : "No active profile is available"} description={!configured ? "This preview has no sign-up, login, saved profile, plan, subscription, pricing, or customer portal." : "Sign in to view your local teacher profile, or create a teacher-only account."} action={!configured ? <LinkButton href="/play">Play without an account</LinkButton> : <LinkButton href="/sign-in">Sign in</LinkButton>} /></>}
    <section aria-labelledby="account-controls-heading"><SectionHeader eyebrow="Account boundaries" title="Security and lifecycle" id="account-controls-heading" compact /><div className="account-control-grid"><Card><h3>Profile</h3><p>Only display name and optional school or organization label are teacher-editable.</p></Card><Card><h3>Password and security</h3><p>Email verification, recovery, and secure password changes use the local identity service.</p></Card><Card><h3>Deletion request</h3><p>A request restricts writes; permanent deletion requires future owner approval.</p></Card><Card variant="muted"><h3>Subscription</h3><p>Plans, billing, and automatic premium grants are deliberately deferred.</p></Card></div></section>
    <Notice label="Data minimization principles" tone="success"><strong>Collect less by design.</strong><p>No student accounts, no rosters, and no browser-controlled value can grant access or change account status.</p></Notice>
  </TeacherShell>;
}
