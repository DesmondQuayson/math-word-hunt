import { notFound, redirect } from "next/navigation";

import { adminSwitchAccountAction } from "../actions";
import { AdminAccountSwitch, AdminSignInForm } from "@/components/admin/admin-auth-forms";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminSecurityConfig, isAdminFeatureEnabled } from "@/lib/admin/config";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectPendingMfaAdmin, inspectPreMfaAdmin } from "@/lib/admin/session";

export const metadata = { title: "Admin sign in", robots: { index: false, follow: false, noarchive: true } };
export const dynamic = "force-dynamic";

export default async function AdminSignInPage({
  searchParams
}: {
    searchParams: Promise<{ expired?: string; signedOut?: string; unavailable?: string; switched?: string }>;
}) {
  if (!isAdminFeatureEnabled()) notFound();
  const config = getAdminSecurityConfig();
  if (!config) return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Restricted system" title="Admin access unavailable" description="The server-side admin security contract is incomplete." />
  </Container>;

  const params = await searchParams;
  const preliminary = await inspectPreMfaAdmin();
  if (preliminary.state === "disabled") notFound();
  const csrfToken = createAdminCsrfToken(config);
  if (preliminary.state === "non-admin") return <Container className="page-stack" width="compact">
    <AdminAccountSwitch csrfToken={csrfToken} action={adminSwitchAccountAction} />
  </Container>;
  if (preliminary.state === "ready" && params.expired !== "1") {
    const pending = await inspectPendingMfaAdmin();
    if (pending.state === "ready") redirect("/admin/mfa");
  }

  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Restricted system" title="Sign in to MathNexa Admin" description="Owner-only access requires a verified password and a fresh TOTP authenticator code." />
    {params.expired === "1" ? <Notice label="Admin session expired" tone="warning" live><strong>Re-authentication required.</strong><p>The short admin session ended. Enter the owner password and complete MFA again.</p></Notice> : null}
    {params.signedOut === "1" ? <Notice label="Admin signed out" tone="success" live><strong>Admin session ended.</strong><p>The server-side session was invalidated.</p></Notice> : null}
    {params.switched === "1" ? <Notice label="Account ready" tone="success" live><strong>Previous MathNexa account signed out.</strong><p>Continue with the authorized owner account.</p></Notice> : null}
    {params.unavailable === "1" || preliminary.state === "unavailable" ? <Notice label="Admin service unavailable" tone="danger"><strong>Fail-closed protection is active.</strong><p>Admin access cannot be established until the server configuration and identity store are available.</p></Notice> : null}
    <Notice label="Owner access boundary" tone="information"><strong>Authorized owner only.</strong><p>Subscriber status, browser storage, cookies claiming an admin role, and client-readable JWT role claims do not grant access.</p></Notice>
    <AdminSignInForm csrfToken={csrfToken} />
  </Container>;
}
