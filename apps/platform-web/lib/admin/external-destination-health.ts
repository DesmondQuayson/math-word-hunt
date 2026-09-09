import "server-only";

import { lookup } from "node:dns/promises";

import { parseExternalGameDestination } from "@math-vocabulary-hunt/platform-core";

import { recordSecurityEvent } from "@/lib/observability/security-events";
import { classifyInternetAddress, isPublicInternetAddress } from "@/lib/security/internet-address";

export { classifyInternetAddress, isPublicInternetAddress } from "@/lib/security/internet-address";

export type ExternalDestinationHealth = Readonly<{
  state: "verified" | "unreachable" | "unsafe";
  checkedAt: string;
  statusCode: number | null;
}>;

export function isReachableExternalStatus(status: number): boolean {
  return status >= 200 && status < 500 && !(status >= 300 && status < 400);
}

/**
 * Reports an SSRF refusal. The destination itself is never recorded — only
 * why it was refused and the class of address it resolved to, which is what a
 * reader needs to tell a typo from a probe. Only an authenticated, MFA-bound
 * admin can reach the callers of this check, so every one of these is worth a
 * look.
 */
async function reportBlockedDestination(
  reason: "destination-not-allowlisted" | "resolution-empty" | "resolved-address-blocked",
  destinationClass: string | null
): Promise<void> {
  await recordSecurityEvent("SSRF_BLOCKED", { reason, destinationClass: destinationClass ?? "none", surface: "admin-external-destination" });
}

export async function checkAdminExternalDestination(value: string, allowedHost: string): Promise<ExternalDestinationHealth> {
  const checkedAt = new Date().toISOString();
  const parsed = parseExternalGameDestination(value, [allowedHost]);
  if (!parsed || parsed.hostname.toLowerCase() !== allowedHost.toLowerCase()) {
    await reportBlockedDestination("destination-not-allowlisted", null);
    return { state: "unsafe", checkedAt, statusCode: null };
  }
  try {
    const addresses = (await lookup(parsed.hostname, { all: true, verbatim: true })).map(({ address }) => address);
    if (!addresses.length) {
      await reportBlockedDestination("resolution-empty", null);
      return { state: "unsafe", checkedAt, statusCode: null };
    }
    const blocked = addresses.find((address) => !isPublicInternetAddress(address));
    if (blocked !== undefined) {
      await reportBlockedDestination("resolved-address-blocked", classifyInternetAddress(blocked));
      return { state: "unsafe", checkedAt, statusCode: null };
    }
    const response = await fetch(parsed, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "MathNexa-Destination-Health/1.0" }
    });
    const verified = isReachableExternalStatus(response.status);
    return { state: verified ? "verified" : "unreachable", checkedAt, statusCode: response.status };
  } catch {
    return { state: "unreachable", checkedAt, statusCode: null };
  }
}
