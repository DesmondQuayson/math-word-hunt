import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { parseExternalGameDestination } from "@math-vocabulary-hunt/platform-core";

export type ExternalDestinationHealth = Readonly<{
  state: "verified" | "unreachable" | "unsafe";
  checkedAt: string;
  statusCode: number | null;
}>;

export function isPublicInternetAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a,b] = octets;
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
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized !== "::" && normalized !== "::1" && !normalized.startsWith("fc") &&
      !normalized.startsWith("fd") && !normalized.startsWith("fe8") && !normalized.startsWith("fe9") &&
      !normalized.startsWith("fea") && !normalized.startsWith("feb") && !normalized.startsWith("ff");
  }
  return false;
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
    const verified = response.status >= 200 && response.status < 500 && !(response.status >= 300 && response.status < 400);
    return { state: verified ? "verified" : "unreachable", checkedAt, statusCode: response.status };
  } catch {
    return { state: "unreachable", checkedAt, statusCode: null };
  }
}
