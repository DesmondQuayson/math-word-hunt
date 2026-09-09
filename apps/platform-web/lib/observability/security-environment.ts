import "server-only";

import { PRODUCTION_PUBLIC_CANONICAL_HOST } from "@/lib/environment/production-public";

/**
 * The deployment label a security event or alert carries.
 *
 * `MVH_APP_ENVIRONMENT` alone cannot separate production from staging: both
 * run `production-platform`, deliberately, so staging rehearses the real
 * runtime. What does separate them is the configured application origin —
 * the canonical redirect already treats "origin IS https://mathnexa.com" as
 * the definition of production, and this reuses that same decision rather
 * than inventing a second one. Both inputs are server-only configuration; no
 * request header or client value can influence the label.
 *
 * "unknown" is reserved for a deployment whose identity cannot be read at all,
 * and it is treated as production wherever the distinction matters (synthetic
 * testing is refused there too).
 */
export const SECURITY_ENVIRONMENTS = ["production", "staging", "preview", "local", "unknown"] as const;
export type SecurityEnvironment = (typeof SECURITY_ENVIRONMENTS)[number];

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function configuredOriginHost(source: EnvironmentSource): { protocol: string; hostname: string } | null {
  try {
    const origin = new URL(String(source.MVH_APPLICATION_ORIGIN ?? "").trim());
    return { protocol: origin.protocol, hostname: origin.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

export function securityEnvironmentLabel(source: EnvironmentSource = process.env): SecurityEnvironment {
  const identity = String(source.MVH_APP_ENVIRONMENT ?? "").trim().toLowerCase();
  if (identity === "production-platform") {
    const origin = configuredOriginHost(source);
    const canonical = origin !== null && origin.protocol === "https:" && origin.hostname === PRODUCTION_PUBLIC_CANONICAL_HOST;
    return canonical ? "production" : "staging";
  }
  if (identity === "production-public") return "production";
  if (identity === "preview") return "preview";
  if (identity === "local") return "local";
  return "unknown";
}

export function isSecurityEnvironment(value: unknown): value is SecurityEnvironment {
  return typeof value === "string" && (SECURITY_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Synthetic security events may only ever be generated where a false alarm is
 * harmless. Production is refused unconditionally, and so is a deployment
 * whose identity cannot be established — an unreadable identity is not a
 * licence to treat it as a test environment.
 */
export function isSyntheticSecurityTestingAllowed(source: EnvironmentSource = process.env): boolean {
  const label = securityEnvironmentLabel(source);
  return label === "staging" || label === "preview" || label === "local";
}

/** Upper-case label for alert subject lines: STAGING is never mistaken for PRODUCTION. */
export function securityEnvironmentBanner(environment: SecurityEnvironment): string {
  return environment.toUpperCase();
}
