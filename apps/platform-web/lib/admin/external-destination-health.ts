import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { parseExternalGameDestination } from "@math-vocabulary-hunt/platform-core";

export type ExternalDestinationHealth = Readonly<{
  state: "verified" | "unreachable" | "unsafe";
  checkedAt: string;
  statusCode: number | null;
}>;

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/**
 * Extracts the IPv4 address embedded in an IPv6 one, if there is one.
 *
 * IPv6 can carry a v4 address in several forms — `::ffff:127.0.0.1`
 * (v4-mapped), `::127.0.0.1` (v4-compatible), `64:ff9b::7f00:1` (NAT64) and
 * `2002:7f00:1::` (6to4). Every one of them reaches the same host as the plain
 * v4 address, so every one has to be judged by the v4 rules.
 *
 * This is the bug that made the classifier unsafe: `::ffff:127.0.0.1` matched
 * none of the blocked IPv6 prefixes, so it was reported as a public internet
 * address. The same held for `::ffff:169.254.169.254` — cloud instance
 * metadata — and for every RFC1918 range.
 */
function embeddedIpv4(normalized: string): string | null {
  // Dotted-quad tail, covering ::ffff:a.b.c.d, ::a.b.c.d and 64:ff9b::a.b.c.d.
  const dotted = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(normalized);
  if (dotted && isIP(dotted[1]!) === 4) return dotted[1]!;

  // Hex tail forms: ::ffff:7f00:1 and 64:ff9b::7f00:1.
  const hexMapped = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (hexMapped) return hexToDotted(hexMapped[1]!, hexMapped[2]!);

  // 6to4 encodes the v4 address in the second and third groups.
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(normalized);
  if (sixToFour) return hexToDotted(sixToFour[1]!, sixToFour[2]!);

  return null;
}

function hexToDotted(high: string, low: string): string {
  const value = (parseInt(high, 16) << 16) | parseInt(low, 16);
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

export function isPublicInternetAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) {
    const normalized = address.toLowerCase();
    // Judge any embedded IPv4 by the IPv4 rules before anything else.
    const embedded = embeddedIpv4(normalized);
    if (embedded) return isPublicIpv4(embedded);
    return normalized !== "::" && normalized !== "::1" && !normalized.startsWith("fc") &&
      !normalized.startsWith("fd") && !normalized.startsWith("fe8") && !normalized.startsWith("fe9") &&
      !normalized.startsWith("fea") && !normalized.startsWith("feb") && !normalized.startsWith("ff");
  }
  return false;
}

export function isReachableExternalStatus(status: number): boolean {
  return status >= 200 && status < 500 && !(status >= 300 && status < 400);
}

export async function checkAdminExternalDestination(value: string, allowedHost: string): Promise<ExternalDestinationHealth> {
  const checkedAt = new Date().toISOString();
  const parsed = parseExternalGameDestination(value, [allowedHost]);
  if (!parsed || parsed.hostname.toLowerCase() !== allowedHost.toLowerCase()) {
    return { state: "unsafe", checkedAt, statusCode: null };
  }
  try {
    const addresses = (await lookup(parsed.hostname, { all: true, verbatim: true })).map(({ address }) => address);
    if (!addresses.length || addresses.some((address) => !isPublicInternetAddress(address))) {
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
