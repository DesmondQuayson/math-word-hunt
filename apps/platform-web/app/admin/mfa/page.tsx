import { notFound } from "next/navigation";

import { AdminMfaFlow } from "@/components/admin/admin-auth-forms";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminSecurityConfig } from "@/lib/admin/config";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectPendingMfaAdmin } from "@/lib/admin/session";

export const metadata = { title: "Admin MFA", robots: { index: false, follow: false, noarchive: true } };

export default async function AdminMfaPage() {
  const preliminary = await inspectPendingMfaAdmin();
  if (preliminary.state !== "ready" || preliminary.assuranceLevel !== "aal1") notFound();
  const config = getAdminSecurityConfig();
  if (!config) notFound();
  const factors = await preliminary.supabase.auth.mfa.listFactors();
  const verifiedFactorId = factors.error ? undefined : factors.data.totp[0]?.id;
  const csrfToken = createAdminCsrfToken(config);

  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Required second factor" title="Verify owner access" description="An admin session is created only after Supabase Auth confirms a TOTP factor at AAL2." />
    <Notice label="Short privileged session" tone="warning"><strong>MFA does not create an unlimited session.</strong><p>Successful verification starts a separate server-owned admin session that expires within 15 minutes by default and can be revoked immediately.</p></Notice>
    <AdminMfaFlow csrfToken={csrfToken} verifiedFactorId={verifiedFactorId} />
  </Container>;
}
