import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { createBillingProvider } from "@/lib/billing/provider-factory";
import { createBillingRepository } from "@/lib/billing/service";
import { processBillingWebhook } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = tryGetBillingConfiguration();
  if (!config?.enabled) return Response.json({ received: false, state: "billing-disabled" }, { status: 503 });
  const repository = createBillingRepository();
  if (!repository) return Response.json({ received: false, state: "database-unavailable" }, { status: 503 });
  const payload = await request.text();
  const result = await processBillingWebhook({ payload, signature: request.headers.get("stripe-signature"), config, provider: createBillingProvider(config), repository });
  return Response.json(result.body, { status: result.status });
}

export function GET() { return Response.json({ error: "method-not-allowed" }, { status: 405, headers: { Allow: "POST" } }); }

