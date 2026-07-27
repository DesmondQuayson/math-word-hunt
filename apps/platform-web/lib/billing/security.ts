import "server-only";

import { createHash } from "node:crypto";

export function billingIdempotencyKey(operation: string, ownerReference: string, discriminator: string): string {
  const digest = createHash("sha256").update(`${operation}\u0000${ownerReference}\u0000${discriminator}`).digest("hex");
  return `mvh-${operation}-${digest.slice(0, 48)}`;
}

export function safeBillingMetadata(ownerReference: string, planKey?: string): Readonly<Record<string, string>> {
  return Object.freeze({
    mvh_teacher_id: ownerReference,
    mvh_product_key: "math-vocabulary-hunt",
    ...(planKey ? { mvh_plan_key: planKey } : {})
  });
}

export function safeBillingLog(category: string, context: Readonly<Record<string, string | number | boolean | null>> = {}): void {
  const safe = Object.fromEntries(Object.entries(context).filter(([key]) => !/(email|customer|subscription|price|event|secret|payload|token)/i.test(key)));
  console.info(JSON.stringify({ scope: "billing", category, ...safe }));
}

