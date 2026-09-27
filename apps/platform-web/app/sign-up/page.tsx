import { Notice } from "@/components/feedback/notice";
import { AuthEmailStatus } from "@/components/auth-email-status";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { SignUpForm } from "@/components/forms/auth-forms";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { TrialPlanSummary } from "@/components/consumer/trial-plan-summary";
import { isSupabaseConfigured } from "@/lib/supabase/public-config";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { POST_AUTH_DESTINATION, isFreeGameDestination } from "@/lib/auth/access-intent";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const configured = isSupabaseConfigured();
  const consumerMode = isProductionPlatformMode();
  const nextDestination = consumerMode
    ? safeInternalRedirect((await searchParams).next, POST_AUTH_DESTINATION)
    : undefined;
  // The header "Start free trial" path: same account creation, presented as
  // the first step of the existing trial onboarding.
  if (consumerMode && nextDestination === "/subscription") return <Container className="page-stack onboarding-page" width="compact">
    <header className="onboarding-header">
      <p className="eyebrow">MathNexa</p>
      <h1>Start your free trial</h1>
      <p className="lede">Get full access to MathNexa math practice, games, learning tools, and premium resources.</p>
    </header>
    {!configured ? <Notice label="Account service unavailable" tone="warning"><strong>Accounts are not available right now.</strong><p>Please try again later.</p></Notice> : null}
    <SignUpForm
      configured={configured}
      consumerMode
      nextDestination={nextDestination}
      trial={{ planSummary: <TrialPlanSummary />, signInHref: "/sign-in?next=/subscription" }}
    />
    <AuthEmailStatus label="Confirmation delivery" />
    <Notice label="Privacy guidance" tone="information"><strong>Minimum account information only.</strong><p>MathNexa does not request profile, school, class, student, organization, assignment, or gameplay-progress information.</p></Notice>
    <AuthorizedCodeForm nextDestination={nextDestination} compact />
  </Container>;
  // A free game: the same account creation, without subscription language.
  const freeGame = isFreeGameDestination(nextDestination);
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow={freeGame ? "Free with a MathNexa account" : consumerMode ? "MathNexa account" : "Local teacher accounts"} title={freeGame ? "Create a free account to play" : consumerMode ? "Create your account" : "Create a teacher account"} description={freeGame ? "Create a free MathNexa account to play Math Tug of War. Confirm your email and you will come straight back to the game. No subscription or trial is started." : consumerMode ? "Use your email address and a private password. Confirm your email before continuing to subscription setup." : "Use an educator email and a private password. This local validation does not create a production account."} />
    <Notice label="Privacy guidance" tone="information"><strong>{consumerMode ? "Minimum account information only." : "Minimum teacher information only."}</strong><p>{consumerMode ? "MathNexa does not request profile, school, class, student, organization, assignment, or gameplay-progress information." : "Do not enter student information or any school, district, classroom, institution, or organization name."}</p></Notice>
    <AuthEmailStatus label="Confirmation delivery" />
    {!configured ? <Notice label="Account service unavailable" tone="warning"><strong>Local accounts are not configured.</strong><p>Start the local Supabase stack and platform together before using this form.</p></Notice> : null}
    <SignUpForm configured={configured} consumerMode={consumerMode} nextDestination={nextDestination} />
    {consumerMode ? <AuthorizedCodeForm nextDestination={nextDestination ?? POST_AUTH_DESTINATION} compact /> : null}
  </Container>;
}
