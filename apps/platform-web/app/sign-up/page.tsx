import { Notice } from "@/components/feedback/notice";
import { AuthEmailStatus } from "@/components/auth-email-status";
import { SignUpForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";

export const metadata = { title: "Create teacher account" };

export default function SignUpPage() {
  const configured = isSupabaseConfigured();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Local teacher accounts" title="Create a teacher account" description="Use an educator email and a private password. This local validation does not create a production account." />
    <Notice label="Privacy guidance" tone="information"><strong>Minimum teacher information only.</strong><p>Do not enter student information or any school, district, classroom, institution, or organization name.</p></Notice>
    <AuthEmailStatus label="Confirmation delivery" />
    {!configured ? <Notice label="Account service unavailable" tone="warning"><strong>Local accounts are not configured.</strong><p>Start the local Supabase stack and platform together before using this form.</p></Notice> : null}
    <SignUpForm configured={configured} />
  </Container>;
}
