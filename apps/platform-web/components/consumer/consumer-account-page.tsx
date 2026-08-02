import { redirect } from "next/navigation";

import { requestConsumerDeletionAction } from "@/app/consumer-actions";
import { signOutAction } from "@/app/auth-actions";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import { getGameAccessView } from "@/lib/game-access/server";

export async function ConsumerAccountPage({ searchParams }: { searchParams?: Promise<{ deletion?: string }> }) {
  const context = await resolveConsumerContext();
  if (context.status === "anonymous" || context.status === "unconfigured") redirect("/sign-in?next=/account");
  const params = searchParams ? await searchParams : {};
  const access = await getGameAccessView();
  if (context.status === "unconfirmed") {
    return <Container className="page-stack" width="compact"><PageHeader eyebrow="Account confirmation" title="Confirm your email" description="Game and subscription access remain unavailable until your email is confirmed."/><Notice label="Confirmation required" tone="warning" live><strong>Check your email.</strong><p>Use the confirmation link, then sign in again. No game access has been granted.</p></Notice></Container>;
  }
  if (context.status === "missing-account" || !context.account) {
    return <Container className="page-stack" width="compact"><PageHeader eyebrow="Account unavailable" title="Your account could not be verified" description="The server could not resolve the minimal account record."/><Notice label="Access denied" tone="warning" live><strong>Account access remains blocked.</strong><p>Contact support. Do not create another account to bypass this state.</p></Notice><form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form></Container>;
  }
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="MathNexa account" title="Your account" description="Only authentication, security, subscription, entitlement, support, and deletion information is associated with this account." />
    {params.deletion === "requested" ? <Notice label="Deletion request" tone="warning" live><strong>Deletion requested.</strong><p>Game access and new subscription actions are denied. Authenticated billing management remains available until cancellation is secured.</p></Notice> : null}
    {params.deletion === "unavailable" ? <Notice label="Deletion request" tone="warning" live><strong>Request unavailable.</strong><p>No deletion state was changed. Contact support if this continues.</p></Notice> : null}
    <dl className="definition-grid" data-testid="consumer-account-summary">
      <div><dt>Email</dt><dd>{context.email ?? "Unavailable"}</dd></div>
      <div><dt>Email confirmation</dt><dd>{context.account.emailConfirmedAt ? "Confirmed" : "Pending"}</dd></div>
      <div><dt>Account status</dt><dd>{context.account.accountStatus.replace("-", " ")}</dd></div>
      <div><dt>Trial history</dt><dd>{context.account.trialRedeemedAt ? "Trial already used" : "Not yet redeemed"}</dd></div>
      <div><dt>Game access</dt><dd>{access.decision.allowed ? "Available" : "Unavailable"}</dd></div>
    </dl>
    <Notice label="Data boundary" tone="information"><strong>No learning profile is stored.</strong><p>MathNexa does not save school, class, roster, assignment, result, score, lesson history, or gameplay progress data.</p></Notice>
    <div className="button-row"><LinkButton href="/subscriber-management">Manage or cancel billing</LinkButton><LinkButton href="/refunds" variant="secondary">Refund review</LinkButton><LinkButton href="/game-access" variant="secondary">Game-access decision</LinkButton></div>
    {context.status === "active" ? <form action={requestConsumerDeletionAction}><button className="button button-secondary" type="submit">Request account deletion</button></form> : null}
    <form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form>
  </Container>;
}
