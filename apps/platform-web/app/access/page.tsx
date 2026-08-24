import { signOutAction } from "@/app/auth-actions";
import { AuthorizedAccessActivePanel } from "@/components/auth/authorized-access-active-panel";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import {
  destinationLabel,
  safeAccessIntentDestination
} from "@/lib/auth/access-intent";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import { resolveSchoolAccessSession } from "@/lib/school-access/session";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Continue to MathNexa",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};
export const dynamic = "force-dynamic";

export default async function AccessIntentPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const destination = safeAccessIntentDestination((await searchParams).next);
  const context = await resolveConsumerContext();
  const signedIn = context.status !== "anonymous" && context.status !== "unconfigured";
  const schoolSession = signedIn ? null : await resolveSchoolAccessSession();

  return <Container className="page-stack access-intent-page" width="compact">
    <PageHeader
      eyebrow="Your MathNexa path"
      title={`Continue to ${destinationLabel(destination)}`}
      description={signedIn
        ? "Continue with your MathNexa account."
        : "Create an account or sign in. After confirmation, MathNexa will return you to the resource you selected."}
    />
    <div className="access-intent-actions" aria-label="Account choices">
      {schoolSession ? <>
        <LinkButton href={destination}>Continue</LinkButton>
        <LinkButton href="/account" variant="secondary">Access status</LinkButton>
      </> : signedIn ? <>
        <LinkButton href="/account">Account</LinkButton>
        <LinkButton href="/subscription" variant="secondary">Subscription</LinkButton>
      </> : <>
        <LinkButton href={`/sign-in?next=${destination}`}>Sign in</LinkButton>
        <LinkButton href={`/sign-up?next=${destination}`} variant="secondary">Create account</LinkButton>
      </>}
    </div>
    {schoolSession
      ? <AuthorizedAccessActivePanel />
      : <AuthorizedCodeForm nextDestination={destination} compact />}
    {signedIn && !schoolSession
      ? <form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form>
      : null}
    {!signedIn && !schoolSession
      ? <p className="truth-note">Account and subscription details appear only after you sign in.</p>
      : null}
    <Notice label="Selected destination" tone="information">
      <strong>{destinationLabel(destination)}</strong>
      <p>Your destination is checked against MathNexa&apos;s server-owned list before it is used.</p>
    </Notice>
  </Container>;
}
