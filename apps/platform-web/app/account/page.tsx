import { EmptyState } from "@/components/feedback/empty-state";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { getTeacherSession } from "@/lib/adapters/identity";

export const metadata = { title: "Account preview" };

export default async function AccountPage() {
  const session = await getTeacherSession();

  return (
    <Container className="page-stack">
      <PageHeader
        eyebrow="Teacher account · Future"
        title="Teacher accounts are not connected"
        description="The approved teacher-only account direction will be implemented in a later phase after identity, privacy, and recovery details are reviewed."
      />
      <Notice label="Teacher account status" tone="information">
        <strong>Signed out</strong>
        <p>{session.message}</p>
      </Notice>
      <EmptyState
        symbol="ID"
        headingId="account-empty-heading"
        title="No profile has been created"
        description="This preview has no sign-up form, login, saved profile, subscription, pricing, or customer portal."
        action={<LinkButton href="/play">Play without an account</LinkButton>}
      />
    </Container>
  );
}
