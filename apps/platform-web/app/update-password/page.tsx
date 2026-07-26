import { UpdatePasswordForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";

export const metadata = { title: "Update password" };
export default function UpdatePasswordPage() {
  const configured = isSupabaseConfigured();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Account recovery" title="Choose a new password" description="A valid recovery session is required. Recovery tokens are never displayed or logged by this page." />
    <UpdatePasswordForm configured={configured} />
  </Container>;
}
