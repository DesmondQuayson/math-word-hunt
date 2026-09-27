import { Notice } from "@/components/feedback/notice";
import { AuthEmailStatus } from "@/components/auth-email-status";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { SignInForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { POST_AUTH_DESTINATION, isFreeGameDestination } from "@/lib/auth/access-intent";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; next?: string }> }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const consumerMode = isProductionPlatformMode();
  const nextDestination = consumerMode ? safeInternalRedirect(params.next, POST_AUTH_DESTINATION) : undefined;
  // Signing in for a free game: keep the game as the destination of both
  // choices, including "Create account" (not the trial onboarding).
  const freeGame = isFreeGameDestination(nextDestination);
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow={consumerMode ? "MathNexa account" : "Local teacher accounts"} title="Sign in" description={freeGame ? "Sign in or create a free MathNexa account to play Math Tug of War. No subscription is needed." : consumerMode ? "Sign in to view your account and server-verified game-access status." : "Open locally saved classes and activity drafts. The current v7 game remains available without an account."} />
    {params.signedOut === "1" ? <Notice label="Signed out" tone="success" live><strong>You are signed out.</strong><p>{consumerMode ? "Account and game access are no longer available in this browser session." : "Protected teacher data is no longer available in this browser session."}</p></Notice> : null}
    <Notice label={consumerMode ? "Account privacy" : "Restricted pilot authentication"} tone="information"><strong>{consumerMode ? "General public account." : "Teacher-only access."}</strong><p>{consumerMode ? "Sign-in errors do not reveal whether an account exists. No educational profile or gameplay progress is collected." : "Only approved adult teachers may use an active controlled pilot. Sign-in errors do not reveal whether an account exists."}</p></Notice>
    <AuthEmailStatus label="Confirmation and recovery delivery" />
    {!configured ? <Notice label="Account service unavailable" tone="warning"><strong>Local accounts are not configured.</strong><p>Start the local Supabase stack and platform together before signing in.</p></Notice> : null}
    <SignInForm configured={configured} nextDestination={nextDestination} consumerMode={consumerMode} signUpHref={freeGame ? `/sign-up?next=${nextDestination}` : consumerMode ? "/sign-up?next=/subscription" : undefined} />
    {consumerMode ? <AuthorizedCodeForm nextDestination={nextDestination ?? POST_AUTH_DESTINATION} compact /> : null}
  </Container>;
}
