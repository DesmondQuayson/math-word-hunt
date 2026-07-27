import "server-only";

import Stripe from "stripe";

import { STRIPE_API_VERSION, type BillingConfiguration } from "./config";

let cached: { key: string; client: Stripe } | null = null;

export function getStripeClient(config: Extract<BillingConfiguration, { enabled: true }>): Stripe {
  if (config.provider !== "stripe" || config.apiVersion !== STRIPE_API_VERSION) throw new Error("Stripe client configuration rejected");
  if (!cached || cached.key !== config.secretKey) {
    cached = { key: config.secretKey, client: new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION, typescript: true }) };
  }
  return cached.client;
}

