import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { getSupportEmail } from "@/lib/commercial/support";
import type { Metadata } from "next";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { publicPageMetadata } from "@/lib/seo/public-pages";

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata("/support") : { title: "Support" };
}

export default function SupportPage() {
  const supportEmail = getSupportEmail();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="MathNexa support" title="Account and subscription help" description="Most account and billing tasks are self-service: manage or cancel your subscription, request a refund review, reset your password, or ask to delete your account. For anything else, email MathNexa support." />
    <div className="button-row"><LinkButton href="/subscriber-management">Manage subscription</LinkButton><LinkButton href="/refunds" variant="secondary">Refund review</LinkButton><LinkButton href="/forgot-password" variant="secondary">Password recovery</LinkButton></div>
    {supportEmail ? <Notice label="Support contact" tone="information"><strong>Email MathNexa support</strong><p><a href={`mailto:${supportEmail}`}>{supportEmail}</a></p></Notice> : <Notice label="Support contact" tone="warning"><strong>Support email is not configured.</strong><p>Commercial activation remains blocked until the owner supplies a monitored support address.</p></Notice>}
    <Notice label="Privacy boundary" tone="information"><strong>Do not send school or student information.</strong><p>Leave out anything about teachers, students, schools, classes or organizations, and any assignments, results, scores or game progress.</p></Notice>
  </Container>;
}
