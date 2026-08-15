import { UpdatePasswordForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Update password", robots: { index: false, follow: false, noarchive: true, nocache: true } };
export default function UpdatePasswordPage() {
  const configured = isSupabaseConfigured();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Account recovery" title="Choose a new password" description="A valid recovery session is required. Recovery tokens are never displayed or logged by this page." />
    <UpdatePasswordForm configured={configured} />
  </Container>;
}
