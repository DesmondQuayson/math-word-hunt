import "server-only";

import { type BillingConfiguration } from "./config";
import { FixtureBillingProvider } from "./fixture-provider";
import type { BillingProvider } from "./provider";
import { getStripeClient } from "./stripe-client";
import { StripeBillingProvider } from "./stripe-provider";

export function createBillingProvider(config: Extract<BillingConfiguration, { enabled: true }>): BillingProvider {
  return config.provider === "fixture" ? new FixtureBillingProvider(config) : new StripeBillingProvider(getStripeClient(config));
}

