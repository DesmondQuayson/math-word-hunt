import { notFound, redirect } from "next/navigation";

import { adminSignOutAction } from "./actions";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAdminSecurityConfig } from "@/lib/admin/config";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectAdminAccess } from "@/lib/admin/session";

export const metadata = { title: "Super Admin", robots: { index: false, follow: false, noarchive: true } };

const placeholders = [
  ["Dashboard", "Operational overview will be introduced in a later phase."],
  ["Games", "Game administration is not implemented in Phase 8A."],
  ["MAP Prep", "A future entry may link to the separate ShowMe Math Admin; no integration exists yet."],
  ["Homework", "Homework administration is not implemented in Phase 8A."],
  ["Quizzes", "Quiz administration is not implemented in Phase 8A."],
  ["Users", "User administration is not implemented in Phase 8A."],
  ["Subscriptions", "Subscription and Stripe operations are not implemented in Phase 8A."],
  ["Analytics", "Analytics collection and reporting are not implemented in Phase 8A."],
  ["Media Library", "The future storage bucket is locked; uploads are not implemented."],
  ["CMS", "Content management is not implemented in Phase 8A."],
  ["Settings", "Admin configuration controls are not implemented in Phase 8A."],
  ["Audit Log", "The append-only security ledger exists server-side; browsing it is not implemented." ]
] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ csrf?: string }> }) {
  const access = await inspectAdminAccess();
  if (access.state === "disabled" || access.state === "non-admin") notFound();
  if (access.state === "unauthenticated") redirect("/admin/sign-in");
  if (access.state === "mfa-required") redirect("/admin/mfa");
  if (access.state === "reauth-required") redirect("/admin/sign-in?expired=1");
  if (access.state === "unavailable") return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Restricted system" title="Admin access unavailable" description="Authorization could not be verified, so access was denied." />
  </Container>;
  const config = getAdminSecurityConfig();
  if (!config) notFound();
  const csrfToken = createAdminCsrfToken(config);
  const params = await searchParams;

  return <Container className="page-stack admin-shell" width="wide">
    <PageHeader eyebrow="Owner-only security shell" title="MathNexa Super Admin" description="Phase 8A provides identity, MFA, server-owned sessions, revocation, and audit foundations only." />
    {params.csrf === "invalid" ? <Notice label="Request expired" tone="warning" live><strong>The state-changing request was blocked.</strong><p>Reload the page before trying again.</p></Notice> : null}
    <Notice label="Phase 8A boundary" tone="information"><strong>No admin product features are active.</strong><p>Every item below is a non-functional placeholder. No subscriber, billing, curriculum, game, or analytics data is queried.</p></Notice>
    <section aria-labelledby="admin-sections-title">
      <h2 id="admin-sections-title">Planned admin areas</h2>
      <div className="admin-placeholder-grid">
        {placeholders.map(([title, description]) => <Card key={title} variant="muted" className="admin-placeholder-card">
          <h3>{title}</h3><p>{description}</p><span aria-disabled="true">Coming in a later phase</span>
        </Card>)}
      </div>
    </section>
    <form action={adminSignOutAction}>
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <Button type="submit" variant="secondary">End admin session</Button>
    </form>
  </Container>;
}
