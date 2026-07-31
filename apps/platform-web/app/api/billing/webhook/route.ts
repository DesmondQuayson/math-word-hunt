import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { createBillingProvider } from "@/lib/billing/provider-factory";
import { createBillingRepository } from "@/lib/billing/service";
import { processBillingWebhook } from "@/lib/billing/webhook";
import { readBoundedBillingBody } from "@/lib/billing/bounded-body";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { createConsumerBillingProvider } from "@/lib/billing/consumer-provider-factory";
import { createConsumerBillingRepository } from "@/lib/billing/consumer-service";
import { processConsumerBillingWebhook } from "@/lib/billing/consumer-webhook";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: string | null;
  try {
    payload = await readBoundedBillingBody(request);
  } catch {
    return Response.json({ received: false, state: "invalid-body" }, { status: 400 });
  }
  if (payload === null) {
    return Response.json({ received: false, state: "payload-too-large" }, { status: 413 });
  }
  if (isProductionPlatformMode()) {
    const config = tryGetConsumerBillingConfiguration();
    if (!config) return Response.json({ received: false, state: "billing-disabled" }, { status: 503 });
    const repository = createConsumerBillingRepository();
    if (!repository) return Response.json({ received: false, state: "database-unavailable" }, { status: 503 });
    const result = await processConsumerBillingWebhook({
      payload,
      signature: request.headers.get("stripe-signature"),
      config,
      provider: createConsumerBillingProvider(config),
      repository
    });
    return Response.json(result.body, { status: result.status });
  }
  const config = tryGetBillingConfiguration();
  if (!config?.enabled) return Response.json({ received: false, state: "billing-disabled" }, { status: 503 });
  const repository = createBillingRepository();
  if (!repository) return Response.json({ received: false, state: "database-unavailable" }, { status: 503 });
  const result = await processBillingWebhook({ payload, signature: request.headers.get("stripe-signature"), config, provider: createBillingProvider(config), repository });
  return Response.json(result.body, { status: result.status });
}

export function GET() { return Response.json({ error: "method-not-allowed" }, { status: 405, headers: { Allow: "POST" } }); }
