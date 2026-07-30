import { ForgotPasswordForm } from "@/components/forms/auth-forms";
import { AuthEmailStatus } from "@/components/auth-email-status";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";

export const metadata = { title: "Recover password" };
export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Account recovery" title="Request a password recovery message" description="For privacy, the result does not reveal whether an email address belongs to an account." />
    <AuthEmailStatus label="Recovery delivery status" />
    <Notice label="Account privacy" tone="information"><strong>Responses remain generic.</strong><p>The result never confirms whether an email address belongs to an account. Contact the pilot coordinator through the original access channel if recovery remains unavailable.</p></Notice>
    <ForgotPasswordForm configured={configured} />
  </Container>;
}
