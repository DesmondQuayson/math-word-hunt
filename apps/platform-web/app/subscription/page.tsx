import { redirect } from "next/navigation";

import { GameAccessStatus } from "@/components/consumer/game-access-status";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getGameAccessView } from "@/lib/game-access/server";

export const metadata = { title: "Subscription status" };
export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const view = await getGameAccessView();
  if (view.context.status === "anonymous" || view.context.status === "unconfigured") redirect("/sign-in?next=/subscription");
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Subscription" title="$5.99 USD monthly game access" description="The approved model includes one 24-hour trial after Stripe-hosted payment-method collection, followed by automatic monthly billing." />
    <GameAccessStatus decision={view.decision} />
    <Notice label="Phase 7B boundary" tone="information"><strong>Checkout is not active.</strong><p>No payment method, trial, charge, Product, Price, or provider resource can be created in this repository-only phase.</p></Notice>
  </Container>;
}
