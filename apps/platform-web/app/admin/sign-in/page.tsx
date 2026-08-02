import { notFound, redirect } from "next/navigation";

import { AdminSignInForm } from "@/components/admin/admin-auth-forms";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminSecurityConfig, isAdminFeatureEnabled } from "@/lib/admin/config";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectPreMfaAdmin } from "@/lib/admin/session";

export const metadata = { title: "Admin sign in", robots: { index: false, follow: false, noarchive: true } };

export default async function AdminSignInPage({
  searchParams
}: {
  searchParams: Promise<{ expired?: string; signedOut?: string; unavailable?: string }>;
}) {
  if (!isAdminFeatureEnabled()) notFound();
  const config = getAdminSecurityConfig();
  if (!config) return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Restricted system" title="Admin access unavailable" description="The server-side admin security contract is incomplete." />
  </Container>;

  const params = await searchParams;
  const preliminary = await inspectPreMfaAdmin();
  if (preliminary.state === "non-admin") notFound();
  if (preliminary.state === "ready" && params.expired !== "1") redirect("/admin/mfa");
  const csrfToken = createAdminCsrfToken(config);

  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Restricted system" title="Super Admin sign in" description="Owner-only access requires a verified password and a fresh TOTP authenticator code." />
    {params.expired === "1" ? <Notice label="Admin session expired" tone="warning" live><strong>Re-authentication required.</strong><p>The short admin session ended. Enter the owner password and complete MFA again.</p></Notice> : null}
    {params.signedOut === "1" ? <Notice label="Admin signed out" tone="success" live><strong>Admin session ended.</strong><p>The server-side session was invalidated.</p></Notice> : null}
    {params.unavailable === "1" || preliminary.state === "unavailable" ? <Notice label="Admin service unavailable" tone="danger"><strong>Fail-closed protection is active.</strong><p>Admin access cannot be established until the server configuration and identity store are available.</p></Notice> : null}
    <Notice label="Owner access boundary" tone="information"><strong>Authorized owner only.</strong><p>Subscriber status, browser storage, cookies claiming an admin role, and client-readable JWT role claims do not grant access.</p></Notice>
    <AdminSignInForm csrfToken={csrfToken} />
  </Container>;
}
