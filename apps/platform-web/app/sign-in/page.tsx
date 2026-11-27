import Link from "next/link";

import { Notice } from "@/components/feedback/notice";
import { AuthEmailStatus } from "@/components/auth-email-status";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { SignInForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { NEW_ACCOUNT_DESTINATION, POST_AUTH_DESTINATION, destinationLabel, isFreeGameDestination, isProductDestination } from "@/lib/auth/access-intent";
import { isEmailLinkFailure, type EmailLinkFailure } from "@/lib/auth/email-link-failure";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

/**
 * Why an email link brought this person here instead of signing them in
 * (app/auth/callback/route.ts). Each message says what happened and the next
 * step; none names a provider, a code or a configuration.
 */
function EmailLinkNotice({ failure, recovery }: Readonly<{ failure: EmailLinkFailure; recovery: boolean }>) {
  if (recovery) return <Notice label="Password reset link" tone="warning" live>
    <strong>This password reset link can’t be used.</strong>
    <p>It may have expired, been used already, or been opened in a different browser. <Link href="/forgot-password">Request a new link</Link>.</p>
  </Notice>;
  if (failure === "link-other-browser") return <Notice label="Email link" tone="information" live>
    <strong>This link couldn’t sign you in here.</strong>
    <p>It may have opened in a different browser or device, expired, or been used already. Sign in below to continue. If your email still needs confirming, you can request a new confirmation email.</p>
  </Notice>;
  if (failure === "link-expired") return <Notice label="Email link" tone="information" live>
    <strong>This link has expired or was already used.</strong>
    <p>Sign in below. If your email address still needs confirming, you can ask for a new confirmation email.</p>
  </Notice>;
  return <Notice label="Email link" tone="information" live>
    <strong>That link didn’t sign you in.</strong>
    <p>Sign in below to continue.</p>
  </Notice>;
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; next?: string; error?: string }> }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const consumerMode = isProductionPlatformMode();
  const nextDestination = consumerMode ? safeInternalRedirect(params.next, POST_AUTH_DESTINATION) : undefined;
  // Signing in for a free game: keep the game as the destination of both
  // choices, including "Create account" (not the trial onboarding).
  const freeGame = isFreeGameDestination(nextDestination);
  // "Start free trial" keeps a product that was asked for (it re-checks access
  // and offers the trial there); anything else starts at the trial step.
  const signUpNext = freeGame || isProductDestination(nextDestination) ? nextDestination : NEW_ACCOUNT_DESTINATION;
  const linkFailure = consumerMode && isEmailLinkFailure(params.error) ? params.error : null;
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow={consumerMode ? "MathNexa account" : "Local teacher accounts"} title="Sign in" description={freeGame ? `Sign in or create a free MathNexa account to play ${destinationLabel(nextDestination)}. No subscription is needed.` : consumerMode ? "Sign in to view your account and server-verified game-access status." : "Open locally saved classes and activity drafts. The current v7 game remains available without an account."} />
    {linkFailure ? <EmailLinkNotice failure={linkFailure} recovery={nextDestination === "/update-password"} /> : null}
    {params.signedOut === "1" ? <Notice label="Signed out" tone="success" live><strong>You are signed out.</strong><p>{consumerMode ? "Account and game access are no longer available in this browser session." : "Protected teacher data is no longer available in this browser session."}</p></Notice> : null}
    <Notice label={consumerMode ? "Account privacy" : "Restricted pilot authentication"} tone="information"><strong>{consumerMode ? "General public account." : "Teacher-only access."}</strong><p>{consumerMode ? "Sign-in errors do not reveal whether an account exists. No educational profile or gameplay progress is collected." : "Only approved adult teachers may use an active controlled pilot. Sign-in errors do not reveal whether an account exists."}</p></Notice>
    <AuthEmailStatus label="Confirmation and recovery delivery" />
    {!configured ? <Notice label="Account service unavailable" tone="warning"><strong>Local accounts are not configured.</strong><p>Start the local Supabase stack and platform together before signing in.</p></Notice> : null}
    <SignInForm configured={configured} nextDestination={nextDestination} consumerMode={consumerMode} signUpHref={consumerMode ? `/sign-up?next=${signUpNext}` : undefined} />
    {consumerMode ? <AuthorizedCodeForm nextDestination={nextDestination ?? POST_AUTH_DESTINATION} compact /> : null}
  </Container>;
}
