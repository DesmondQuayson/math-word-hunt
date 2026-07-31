import "server-only";

import Stripe from "stripe";

import { STRIPE_API_VERSION } from "./config";
import type { ConsumerBillingConfiguration } from "./consumer-config";
import { ConsumerFixtureBillingProvider } from "./consumer-fixture-provider";
import type { ConsumerBillingProvider } from "./consumer-provider";
import { ConsumerStripeBillingProvider } from "./consumer-stripe-provider";

export function createConsumerBillingProvider(config: ConsumerBillingConfiguration): ConsumerBillingProvider {
  return config.provider === "fixture"
    ? new ConsumerFixtureBillingProvider(config)
    : new ConsumerStripeBillingProvider(new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION }));
}
