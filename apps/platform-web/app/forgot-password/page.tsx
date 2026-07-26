import { ForgotPasswordForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";

export const metadata = { title: "Recover password" };
export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Account recovery" title="Request a password recovery message" description="For privacy, the result does not reveal whether an email address belongs to an account." />
    <ForgotPasswordForm configured={configured} />
  </Container>;
}
