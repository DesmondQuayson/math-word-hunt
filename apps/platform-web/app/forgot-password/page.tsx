import { ForgotPasswordForm } from "@/components/forms/auth-forms";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";

export const metadata = { title: "Recover password" };
export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Account recovery" title="Request a password recovery message" description="For privacy, the result does not reveal whether an email address belongs to an account." />
    <Notice label="Recovery delivery status" tone="warning"><strong>External recovery delivery is not active for the restricted pilot.</strong><p>Local development may capture a message for testing, but this page does not promise that an email will be delivered. Contact the pilot coordinator through the channel used to provide access if account recovery is needed.</p></Notice>
    <ForgotPasswordForm configured={configured} />
  </Container>;
}
