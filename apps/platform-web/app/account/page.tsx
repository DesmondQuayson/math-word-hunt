import { signOutAction } from "@/app/auth-actions";
import { openBillingPortalAction } from "@/app/billing-actions";
import { ExistingDataSafeNotice } from "@/components/capabilities/existing-data-safe-notice";
import { UsageLimitSummary } from "@/components/capabilities/usage-limit-summary";
import { EmptyState } from "@/components/feedback/empty-state";
import { Notice } from "@/components/feedback/notice";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { DeletionRequestForm, ProfileForm } from "@/components/forms/teacher-data-forms";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getCapabilityAccessView } from "@/lib/capabilities/server";
import { getTeacherSession } from "@/lib/adapters/identity";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";
import { createServerRepositories } from "@/lib/repositories/server-repositories";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";
import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { billingAccountCopy } from "@/lib/billing/copy";
import { AuthEmailStatus } from "@/components/auth-email-status";
import type { SubscriptionProjection } from "@/lib/billing/repository";
import { createBillingRepository } from "@/lib/billing/service";
import { ConsumerAccountPage } from "@/components/consumer/consumer-account-page";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export const metadata = { title: isProductionPlatformMode() ? "Account" : "Teacher account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ deletion?: string }> }) {
  if (isProductionPlatformMode()) return <ConsumerAccountPage searchParams={searchParams} />;
  const prototype = getTeacherPrototypeState();
  const configured = isSupabaseConfigured();
  const [session, access] = await Promise.all([getTeacherSession(), getCapabilityAccessView()]);
  const repositories = session.teacher ? await createServerRepositories() : null;
  const deletion = repositories && session.teacher ? await repositories.deletionRequests.getOpen(session.teacher.userId) : null;
  const profile = session.teacher?.profile;
  const billingConfig = tryGetBillingConfiguration();
  const enabledBillingConfig = billingConfig?.enabled === true ? billingConfig : null;
  const billingRepository = profile && enabledBillingConfig ? createBillingRepository() : null;
  let billingUnavailable = false;
  let billingSubscription: SubscriptionProjection | null = null;
  if (billingRepository && session.teacher && enabledBillingConfig) {
    try { billingSubscription = await billingRepository.getLatestSubscription(session.teacher.userId, enabledBillingConfig.stripeMode); }
    catch { billingUnavailable = true; }
  }
  const billingCopy = billingAccountCopy(billingSubscription, new Date(), access.usage?.planKey ?? null);

  return <TeacherShell currentPath="/account" accountNote={profile ? "Local teacher account and test-safe billing status controls are enabled." : undefined}>
    <PageHeader eyebrow="Teacher workspace · Account" title={profile ? "Your teacher account" : configured ? "Teacher account" : "A future teacher account, with clear boundaries"} description={profile ? "Manage the approved profile fields and account lifecycle for this local teacher account." : configured ? "Local teacher authentication is being validated without changing the standalone v7 game." : "Teacher profiles, password controls, and deletion requests are planned, but account setup and security tools are not available in this preview."} />
    {prototype.enabled ? <><PrototypeDataNotice /><section aria-labelledby="profile-structure-heading" data-prototype-fixture="account-structure"><SectionHeader eyebrow="Demonstration structure" title="Profile information" id="profile-structure-heading" compact /><dl className="definition-grid"><div><dt>Display name</dt><dd>{prototype.data.teacherLabel}</dd></div><div><dt>Role</dt><dd>Teacher</dd></div><div><dt>Account status</dt><dd>Demonstration only</dd></div><div><dt>Subscription</dt><dd>Deliberately deferred</dd></div></dl></section></> : profile ? <>
      <Notice label="Teacher account status" tone={session.status === "active" ? "success" : "warning"}><strong>{session.status === "active" ? "Active local account" : session.status === "suspended" ? "Account suspended" : "Deletion requested"}</strong><p>{session.message}</p></Notice>
      <dl className="definition-grid" data-testid="real-account-summary"><div><dt>Email</dt><dd>{session.teacher?.email ?? "Unavailable"}</dd></div><div><dt>Role</dt><dd>Teacher</dd></div><div><dt>Account status</dt><dd>{profile.accountStatus}</dd></div><div><dt>Current plan</dt><dd>{access.usage?.planKey === "teacher-pro-monthly" ? "Teacher Pro Monthly" : access.usage?.planKey === "teacher-pro-annual" ? "Teacher Pro Annual" : "Free"}</dd></div></dl>
      {access.usage ? <section aria-labelledby="account-usage-heading"><SectionHeader eyebrow="Workspace use" title="Plan capacity" id="account-usage-heading" compact /><div className="teacher-task-grid-compact"><UsageLimitSummary label="Active classes" current={access.usage.activeClassCount} maximum={access.usage.activeClassLimit} planLabel={access.usage.planKey === "free" ? "Free" : "Teacher Pro"} headingId="account-class-capacity" /><UsageLimitSummary label="Activity drafts" current={access.usage.activeActivityCount} maximum={access.usage.activeActivityLimit} planLabel={access.usage.planKey === "free" ? "Free" : "Teacher Pro"} headingId="account-activity-capacity" /></div></section> : <Notice label="Plan capacity" tone="warning"><strong>Capacity unavailable</strong><p>Access state could not be verified safely. New constrained records remain unavailable.</p></Notice>}
      <ExistingDataSafeNotice />
      {session.status === "active" ? <section aria-labelledby="profile-edit-heading"><SectionHeader eyebrow="Approved profile fields" title="Profile" id="profile-edit-heading" compact /><ProfileForm displayName={profile.displayName} /></section> : null}
      <section aria-labelledby="deletion-heading"><SectionHeader eyebrow="Account lifecycle" title="Deletion request" id="deletion-heading" compact />{deletion?.ok || session.status === "deletion-requested" ? <Notice label="Deletion request" tone="warning"><strong>Request pending{deletion?.ok ? ` · ${deletion.value.lifecycleState.replaceAll("_", " ")}` : ""}</strong><p>No account data has been permanently deleted. New class and activity writes are restricted. Destructive execution is disabled pending owner-approved retention policy.</p></Notice> : session.status === "active" ? <DeletionRequestForm /> : <p>This account cannot create another deletion request.</p>}</section>
      <section aria-labelledby="billing-heading"><SectionHeader eyebrow="Subscription" title="Billing" id="billing-heading" compact />
        {session.status === "suspended" ? <Notice label="Billing status" tone="warning"><strong>Billing management unavailable</strong><p>This account is suspended. Premium use and portal access are denied; contact support.</p></Notice> : session.status === "deletion-requested" ? <Notice label="Billing status" tone="warning"><strong>Support-assisted cancellation</strong><p>Premium use, Checkout, and portal access are denied while deletion is pending.</p></Notice> : billingUnavailable ? <Notice label="Billing status" tone="warning"><strong>Billing unavailable</strong><p>Access remains limited until verified billing records can be read.</p></Notice> : <Notice label="Billing status" tone={billingCopy.tone}><strong>{billingCopy.title}</strong><p>{billingCopy.message}</p></Notice>}
        <div className="button-row"><LinkButton href="/pricing" variant="secondary">View plans</LinkButton>{session.status === "active" && enabledBillingConfig?.portalEnabled && billingSubscription ? <form action={openBillingPortalAction}><button className="button button-primary" type="submit">Manage billing</button></form> : null}</div>
      </section>
      <form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form>
    </> : <><Notice label="Teacher account status" tone={session.status === "missing-profile" ? "warning" : "information"}><strong>{session.status === "missing-profile" ? "Profile unavailable" : "Signed out"}</strong><p>{session.message}</p></Notice><EmptyState symbol="ID" headingId="account-empty-heading" title={!configured ? "No profile has been created" : "No active profile is available"} description={!configured ? "This preview has no sign-up, login, saved profile, plan, subscription, pricing, or customer portal." : "Sign in to view your local teacher profile, or create a teacher-only account."} action={!configured ? <LinkButton href="/play">Play without an account</LinkButton> : <LinkButton href="/sign-in">Sign in</LinkButton>} /></>}
    <section aria-labelledby="account-controls-heading"><SectionHeader eyebrow="Account boundaries" title="Security and lifecycle" id="account-controls-heading" compact /><div className="account-control-grid"><Card><h3>Profile</h3><p>Only the teacher display name can be edited. Organization labels are disabled for this controlled pilot.</p></Card><Card><h3>Password and security</h3><p>Email verification, recovery, and secure password changes use the configured identity service.</p></Card><Card><h3>Deletion request</h3><p>A request restricts writes; permanent deletion requires future owner approval.</p></Card><Card variant="muted"><h3>Subscription</h3><p>Billing and payments remain disabled for the controlled pilot.</p></Card></div></section>
    <AuthEmailStatus label="Confirmation and recovery" />
    <Notice label="Data minimization principles" tone="success"><strong>Collect less by design.</strong><p>No student accounts, no rosters, and no browser-controlled value can grant access or change account status.</p></Notice>
  </TeacherShell>;
}
