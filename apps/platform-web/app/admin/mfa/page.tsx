import { notFound } from "next/navigation";

import { AdminMfaFlow } from "@/components/admin/admin-auth-forms";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminSecurityConfig } from "@/lib/admin/config";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectPendingMfaAdmin } from "@/lib/admin/session";
import { ADMIN_SESSION_IDLE_MINUTES, safeAdminNextPath } from "@/lib/admin/session-policy";

export const metadata = { title: "Admin MFA", robots: { index: false, follow: false, noarchive: true } };

export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const preliminary = await inspectPendingMfaAdmin();
  if (preliminary.state !== "ready" || preliminary.assuranceLevel !== "aal1") notFound();
  const config = getAdminSecurityConfig();
  if (!config) notFound();
  const factors = await preliminary.supabase.auth.mfa.listFactors();
  const verifiedFactorId = factors.error ? undefined : factors.data.totp[0]?.id;
  const csrfToken = createAdminCsrfToken(config);
  const next = safeAdminNextPath((await searchParams).next);
  const hours = config.sessionMinutes / 60;
  const lifetime = config.sessionMinutes % 60 === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${config.sessionMinutes} minutes`;

  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Required second factor" title="Verify owner access" description="An admin session is created only after Supabase Auth confirms a TOTP factor at AAL2." />
    <Notice label="Bounded privileged session" tone="warning"><strong>MFA does not create an unlimited session.</strong><p>Successful verification starts a separate server-owned admin session that lasts at most {lifetime}, ends after {ADMIN_SESSION_IDLE_MINUTES} minutes without activity, and can be revoked immediately. Sensitive operations ask for a fresh authenticator code.</p></Notice>
    <AdminMfaFlow csrfToken={csrfToken} verifiedFactorId={verifiedFactorId} next={next} />
  </Container>;
}
