import "server-only";

import { getPublicCrawlPolicy } from "./crawl-policy";
import { getServerEnvironment } from "./server";

/**
 * The server-owned operational status contract (production bug sweep BS-02).
 *
 * `/status` and `/api/health` both read this, so the two can never report
 * different capabilities. Every value is a sanitized enum derived from the
 * server environment registry and the published crawl policy: no keys, no
 * provider identities, no customer data, nothing a browser can influence.
 *
 * It OBSERVES configuration. It cannot enable or disable anything, and it
 * fails to "unknown"/"unavailable" rather than guessing.
 */
export type OperationalStatus = Readonly<{
  environment: "production" | "staging" | "development" | "unknown";
  platform: "operational" | "configuration-required";
  /** Crawl and index PERMISSION for the public pages, not Google's index state. */
  searchIndexing: "enabled" | "blocked" | "unknown";
  payments: "live" | "test" | "unavailable" | "unknown";
}>;

export function getOperationalStatus(source: NodeJS.ProcessEnv = process.env): OperationalStatus {
  const registry = getServerEnvironment(source);
  if (!registry) {
    // An invalid or absent server contract means nothing can be asserted
    // truthfully, so nothing is.
    return Object.freeze({
      environment: "unknown",
      platform: "configuration-required",
      searchIndexing: "unknown",
      payments: "unknown"
    });
  }
  const environment =
    registry.identity === "production-public" || registry.identity === "production-platform"
      ? "production"
      : registry.identity === "preview"
        ? "staging"
        : registry.identity === "local"
          ? "development"
          : "unknown";
  // `billingAvailable` is the registry's own gate for the payment surfaces, so a
  // mode without an available surface reads as unavailable rather than live.
  const payments = !registry.billingAvailable
    ? "unavailable"
    : registry.paymentMode === "live"
      ? "live"
      : registry.paymentMode === "test"
        ? "test"
        : "unavailable";
  return Object.freeze({
    environment,
    platform: "operational",
    searchIndexing: getPublicCrawlPolicy(source).publicIndexing,
    payments
  });
}
