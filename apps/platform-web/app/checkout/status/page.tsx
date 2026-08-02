import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { createBillingProvider } from "@/lib/billing/provider-factory";
import { createBillingRepository, getCheckoutDisplayState, type CheckoutDisplayState } from "@/lib/billing/service";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { createConsumerBillingProvider } from "@/lib/billing/consumer-provider-factory";
import {
  createConsumerBillingRepository,
  getConsumerCheckoutState
} from "@/lib/billing/consumer-service";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { getGameAccessView } from "@/lib/game-access/server";

export const metadata = { title: "Checkout status" };
export const dynamic = "force-dynamic";

const copy: Record<CheckoutDisplayState, { title: string; message: string; tone: "information" | "success" | "warning" }> = {
  processing: { title: "Checkout received", message: "We are securely confirming the subscription. This page does not grant access by itself.", tone: "information" },
  active: { title: "Teacher Pro active", message: "Verified billing reconciliation has activated the implemented Pro features.", tone: "success" },
  "payment-incomplete": { title: "Payment incomplete", message: "Premium access remains unavailable. Use billing support or try again later.", tone: "warning" },
  canceled: { title: "Checkout canceled", message: "No subscription change was confirmed.", tone: "information" },
  expired: { title: "Checkout expired", message: "This secure Checkout link expired. Start a new test Checkout if needed.", tone: "warning" },
  unavailable: { title: "Billing status unavailable", message: "We cannot safely confirm this Checkout. Access remains limited.", tone: "warning" },
  "manual-review": { title: "Billing review needed", message: "Support must review the billing record before access can change.", tone: "warning" }
};

const consumerCopy = {
  processing: { title: "Payment method saved", message: "Stripe completed setup. The server is creating and verifying the subscription; this redirect cannot grant access.", tone: "information" },
  trialing: { title: "24-hour trial active", message: "The server verified the subscription and exact trial expiration shown below.", tone: "success" },
  active: { title: "Subscription active", message: "The server verified the paid monthly subscription.", tone: "success" },
  "payment-required": { title: "Payment requires attention", message: "Game access remains locked until Stripe confirms successful payment or an approved renewal grace period.", tone: "warning" },
  expired: { title: "Setup session expired", message: "No trial or subscription was activated. Start a new setup from Pricing.", tone: "warning" },
  unavailable: { title: "Billing status unavailable", message: "The server could not verify this Setup Checkout. Access remains locked.", tone: "warning" },
  "manual-review": { title: "Billing review required", message: "Ownership or provider data did not match. Access remains locked while support reviews the record.", tone: "warning" }
} as const;

async function ConsumerCheckoutStatus({ sessionId }: { sessionId: string }) {
  const [context, access] = await Promise.all([resolveConsumerContext(), getGameAccessView()]);
  const config = tryGetConsumerBillingConfiguration();
  const repository = config ? createConsumerBillingRepository(config) : null;
  const state = config && repository
    ? await getConsumerCheckoutState({
      context,
      config,
        sessionId,
        provider: createConsumerBillingProvider(config),
        repository
      })
    : "unavailable";
  const content = consumerCopy[state];
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Stripe billing" title="Subscription setup status" description="Only verified Stripe, current consent, and server records can activate MathNexa game access." />
    <Notice label="Setup status" tone={content.tone} live><strong>{content.title}</strong><p>{content.message}</p></Notice>
    {access.decision.accessEndsAt ? <Notice label="Authoritative access window" tone="success"><strong>Verified expiration</strong><p><time dateTime={access.decision.accessEndsAt}>{new Date(access.decision.accessEndsAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}</time></p></Notice> : null}
    <div className="button-row">
      {access.decision.allowed ? <LinkButton href="/play">Play MathNexa</LinkButton> : <LinkButton href={`/checkout/status?session_id=${encodeURIComponent(sessionId)}`}>Refresh verified status</LinkButton>}
      <LinkButton href="/subscription" variant="secondary">Subscription status</LinkButton>
    </div>
  </Container>;
}

export default async function CheckoutStatusPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const sessionId = (await searchParams).session_id ?? "";
  if (isProductionPlatformMode()) return <ConsumerCheckoutStatus sessionId={sessionId} />;
  const config = tryGetBillingConfiguration();
  const context = await resolveTeacherContext();
  const repository = createBillingRepository();
  const state = config?.enabled && repository ? await getCheckoutDisplayState({ context, config, provider: createBillingProvider(config), repository, sessionId }) : "unavailable";
  const content = copy[state];
  return <Container className="page-stack"><PageHeader eyebrow="Secure billing" title="Checkout status" description="Access changes only after verified server reconciliation."/><Notice label="Checkout status" tone={content.tone} live><strong>{content.title}</strong><p>{content.message}</p></Notice><div className="button-row"><LinkButton href="/account">Return to account</LinkButton><LinkButton href={`/checkout/status?session_id=${encodeURIComponent(sessionId)}`} variant="secondary">Refresh status</LinkButton></div></Container>;
}
