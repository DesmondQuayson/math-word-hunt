import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { createBillingProvider } from "@/lib/billing/provider-factory";
import { createBillingRepository, getCheckoutDisplayState, type CheckoutDisplayState } from "@/lib/billing/service";

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

export default async function CheckoutStatusPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const sessionId = (await searchParams).session_id ?? "";
  const config = tryGetBillingConfiguration();
  const context = await resolveTeacherContext();
  const repository = createBillingRepository();
  const state = config?.enabled && repository ? await getCheckoutDisplayState({ context, config, provider: createBillingProvider(config), repository, sessionId }) : "unavailable";
  const content = copy[state];
  return <Container className="page-stack"><PageHeader eyebrow="Secure billing" title="Checkout status" description="Access changes only after verified server reconciliation."/><Notice label="Checkout status" tone={content.tone} live><strong>{content.title}</strong><p>{content.message}</p></Notice><div className="button-row"><LinkButton href="/account">Return to account</LinkButton><LinkButton href={`/checkout/status?session_id=${encodeURIComponent(sessionId)}`} variant="secondary">Refresh status</LinkButton></div></Container>;
}

