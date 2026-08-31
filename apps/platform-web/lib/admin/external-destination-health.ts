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
 * Expands an IPv6 address to its 16 bytes.
 *
 * Deciding IPv6 by string prefix is what made the previous version wrong, in
 * more than one direction. `::ffff:127.0.0.1` matched none of the blocked
 * prefixes and passed as public. `0:0:0:0:0:0:0:1` is loopback but is not the
 * literal string `"::1"`, so it passed too. And a naive "does it end in a
 * dotted quad" test wrongly treats `fe80::8.8.8.8` as a public v4 address when
 * it is link-local.
 *
 * One address has many spellings; its bytes have one. Everything below judges
 * the bytes, so no spelling can change the answer.
 */
function expandIpv6(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  let value = address.toLowerCase();

  // A trailing dotted quad (::ffff:127.0.0.1) contributes the last four bytes.
  let tail: number[] = [];
  const dotted = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(value);
  if (dotted) {
    const parts = dotted[1]!.split(".").map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    tail = parts;
    value = value.slice(0, value.length - dotted[1]!.length);
    if (value.endsWith(":") && !value.endsWith("::")) value = value.slice(0, -1);
  }

  const [head, rest, extra] = value.split("::");
  if (extra !== undefined) return null;

  const toGroups = (segment: string) =>
    segment.split(":").filter((part) => part.length > 0).map((part) => parseInt(part, 16));
  const left = head ? toGroups(head) : [];
  const right = rest ? toGroups(rest) : [];
  if ([...left, ...right].some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) return null;

  const groupBytes = (groups: number[]) => groups.flatMap((g) => [(g >> 8) & 255, g & 255]);
  const leftBytes = groupBytes(left);
  const rightBytes = groupBytes(right);
  const known = leftBytes.length + rightBytes.length + tail.length;
  if (known > 16) return null;

  // `::` expands to whatever zero bytes are missing; without it the address
  // must already be complete.
  if (rest === undefined && extra === undefined && !value.includes("::") && known !== 16) return null;
  const bytes = [...leftBytes, ...new Array(16 - known).fill(0), ...rightBytes, ...tail];
  return bytes.length === 16 ? bytes : null;
}

function bytesAreZero(bytes: number[], from: number, to: number): boolean {
  for (let i = from; i < to; i += 1) if (bytes[i] !== 0) return false;
  return true;
}

export function isPublicInternetAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;

  const bytes = expandIpv6(address);
  if (!bytes) return false;

  // Unspecified (::) and loopback (::1), in every spelling.
  if (bytesAreZero(bytes, 0, 15)) return bytes[15] !== 0 && bytes[15] !== 1;

  const embeddedV4 = () => bytes.slice(12, 16).join(".");

  // IPv4-mapped ::ffff:0:0/96 and IPv4-translated ::ffff:0:0:0/96.
  if (bytesAreZero(bytes, 0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPublicIpv4(embeddedV4());
  // IPv4-compatible ::a.b.c.d (deprecated but still routable through some stacks).
  if (bytesAreZero(bytes, 0, 12)) return isPublicIpv4(embeddedV4());
  // NAT64 well-known prefix 64:ff9b::/96.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytesAreZero(bytes, 4, 12)) {
    return isPublicIpv4(embeddedV4());
  }
  // 6to4 2002::/16 carries the v4 address in bytes 2..5.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isPublicIpv4(bytes.slice(2, 6).join("."));

  // Native IPv6 ranges, checked on the bytes so a compressed or uppercase
  // spelling cannot slip past.
  if ((bytes[0]! & 0xfe) === 0xfc) return false;                       // fc00::/7  unique-local
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return false;  // fe80::/10 link-local
  if (bytes[0] === 0xff) return false;                                 // ff00::/8  multicast
  if (bytes[0] === 0x01 && bytesAreZero(bytes, 1, 8)) return false;    // 100::/64  discard-only
  return true;
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
