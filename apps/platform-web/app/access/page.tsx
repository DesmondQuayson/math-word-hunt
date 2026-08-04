import { redirect } from "next/navigation";

import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import {
  confirmationRequiredHref,
  destinationLabel,
  safeAccessIntentDestination
} from "@/lib/auth/access-intent";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
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
  if (context.status === "unconfirmed") redirect(confirmationRequiredHref(destination));
  if (context.status !== "anonymous" && context.status !== "unconfigured") redirect(destination);

  return <Container className="page-stack access-intent-page" width="compact">
    <PageHeader
      eyebrow="Your MathNexa path"
      title={`Continue to ${destinationLabel(destination)}`}
      description="Create an account or sign in. After confirmation, MathNexa will return you to the resource you selected."
    />
    <Notice label="Selected destination" tone="information">
      <strong>{destinationLabel(destination)}</strong>
      <p>Your destination is checked against MathNexa&apos;s server-owned list before it is used.</p>
    </Notice>
    <div className="access-intent-actions" aria-label="Account choices">
      <LinkButton href={`/sign-up?next=${destination}`}>Create an account</LinkButton>
      <LinkButton href={`/sign-in?next=${destination}`} variant="secondary">Sign in</LinkButton>
    </div>
    <p className="truth-note">Account and subscription details appear only after you sign in.</p>
  </Container>;
}
