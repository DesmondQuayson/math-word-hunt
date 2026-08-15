import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth-actions";
import { AuthEmailStatus } from "@/components/auth-email-status";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { accessIntentHref, destinationLabel, safeAccessIntentDestination } from "@/lib/auth/access-intent";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Email confirmation required",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};
export const dynamic = "force-dynamic";

export default async function ConfirmationRequiredPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const destination = safeAccessIntentDestination((await searchParams).next);
  const context = await resolveConsumerContext();
  if (context.status === "anonymous" || context.status === "unconfigured") {
    redirect(accessIntentHref(destination));
  }
  if (context.status !== "unconfirmed") redirect(destination);

  return <Container className="page-stack" width="compact">
    <PageHeader
      eyebrow="Account confirmation"
      title="Confirm your email"
      description={`Confirm your address before continuing to ${destinationLabel(destination)}.`}
    />
    <Notice label="Confirmation required" tone="warning" live>
      <strong>Check your email.</strong>
      <p>Use the confirmation link for this account. MathNexa will then continue to your selected destination.</p>
    </Notice>
    <AuthEmailStatus label="Confirmation delivery" />
    <form action={signOutAction}>
      <button className="button button-secondary" type="submit">Sign out</button>
    </form>
  </Container>;
}
