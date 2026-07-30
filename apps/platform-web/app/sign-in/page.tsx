import { Notice } from "@/components/feedback/notice";
import { AuthEmailStatus } from "@/components/auth-email-status";
import { SignInForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";

export const metadata = { title: "Teacher sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string }> }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Local teacher accounts" title="Sign in" description="Open locally saved classes and activity drafts. The current v7 game remains available without an account." />
    {params.signedOut === "1" ? <Notice label="Signed out" tone="success" live><strong>You are signed out.</strong><p>Protected teacher data is no longer available in this browser session.</p></Notice> : null}
    <Notice label="Restricted pilot authentication" tone="information"><strong>Teacher-only access.</strong><p>Only approved adult teachers may use an active controlled pilot. Sign-in errors do not reveal whether an account exists.</p></Notice>
    <AuthEmailStatus label="Confirmation and recovery delivery" />
    {!configured ? <Notice label="Account service unavailable" tone="warning"><strong>Local accounts are not configured.</strong><p>Start the local Supabase stack and platform together before signing in.</p></Notice> : null}
    <SignInForm configured={configured} />
  </Container>;
}
