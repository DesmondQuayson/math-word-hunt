import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { getSupportEmail } from "@/lib/commercial/support";

export const metadata = { title: "Support" };

export default function SupportPage() {
  const supportEmail = getSupportEmail();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="MathNexa support" title="Account and subscription help" description="Use authenticated self-service first for billing management, cancellation, refunds, password recovery, and deletion requests." />
    <div className="button-row"><LinkButton href="/subscriber-management">Manage subscription</LinkButton><LinkButton href="/refunds" variant="secondary">Refund review</LinkButton><LinkButton href="/forgot-password" variant="secondary">Password recovery</LinkButton></div>
    {supportEmail ? <Notice label="Support contact" tone="information"><strong>Email MathNexa support</strong><p><a href={`mailto:${supportEmail}`}>{supportEmail}</a></p></Notice> : <Notice label="Support contact" tone="warning"><strong>Support email is not configured.</strong><p>Commercial activation remains blocked until the owner supplies a monitored support address.</p></Notice>}
    <Notice label="Privacy boundary" tone="information"><strong>Do not send educational data.</strong><p>Never send teacher, student, school, class, organization, assignment, result, score, or gameplay-progress information.</p></Notice>
  </Container>;
}
