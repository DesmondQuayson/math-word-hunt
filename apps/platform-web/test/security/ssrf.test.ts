/**
 * SSRF address classification.
 *
 * The admin destination health check resolves a hostname and then refuses to
 * fetch it if any resolved address is not on the public internet. That decision
 * is the whole control, so every way of expressing a private address has to be
 * caught — including the IPv6 spellings of an IPv4 address, which is exactly
 * where it was previously wrong.
 */
import { describe, expect, it } from "vitest";

import { isPublicInternetAddress, isReachableExternalStatus } from "@/lib/admin/external-destination-health";
import { SSRF_TARGETS } from "./fixtures/adversarial";

describe("private IPv4 is refused", () => {
  it("blocks loopback, link-local, metadata and every RFC1918 range", () => {
    for (const address of [
      "127.0.0.1", "127.1.2.3", "0.0.0.0", "10.0.0.1", "10.255.255.254",
      "172.16.0.1", "172.31.255.254", "192.168.0.1", "192.168.255.254",
      "169.254.169.254", "169.254.0.1", "100.64.0.1", "192.0.0.1",
      "198.18.0.1", "198.19.255.255", "224.0.0.1", "239.255.255.255", "255.255.255.255"
    ]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("still allows genuine public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "192.169.0.1", "100.63.255.255"]) {
      expect(isPublicInternetAddress(address), `${address} must be allowed`).toBe(true);
    }
  });
});

describe("IPv4 addresses wearing an IPv6 costume are refused", () => {
  it("blocks the v4-mapped form, which previously passed as public", () => {
    // ::ffff:127.0.0.1 matched none of the blocked IPv6 prefixes, so the
    // classifier reported loopback as a public internet address. Same for cloud
    // instance metadata and every private range.
    for (const address of [
      "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:10.0.0.1",
      "::ffff:192.168.1.1", "::ffff:172.16.0.1", "::ffff:0.0.0.0",
      "::FFFF:127.0.0.1"
    ]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("blocks the v4-compatible and hex-tail spellings too", () => {
    for (const address of ["::127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:0a00:1"]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("blocks NAT64 and 6to4 encodings of a private address", () => {
    for (const address of ["64:ff9b::127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2002:a9fe:a9fe::"]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("does not over-block a public address expressed through those mechanisms", () => {
    for (const address of ["::ffff:8.8.8.8", "64:ff9b::8.8.8.8", "2002:0808:0808::"]) {
      expect(isPublicInternetAddress(address), `${address} must be allowed`).toBe(true);
    }
  });
});

describe("native IPv6 private ranges are refused", () => {
  it("blocks loopback, unspecified, unique-local, link-local and multicast", () => {
    for (const address of ["::1", "::", "fc00::1", "fd00::1", "fe80::1", "fe80::abcd", "ff02::1"]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("still allows a genuine public IPv6 address", () => {
    for (const address of ["2606:4700:4700::1111", "2001:4860:4860::8888"]) {
      expect(isPublicInternetAddress(address), `${address} must be allowed`).toBe(true);
    }
  });
});

describe("anything that is not an IP literal is refused", () => {
  it("refuses hostnames, empty values and malformed input", () => {
    for (const value of ["", " ", "localhost", "example.com", "127.0.0.1.nip.io", "not-an-address", "999.999.999.999", "127.0.0"]) {
      expect(isPublicInternetAddress(value), `${JSON.stringify(value)} must be refused`).toBe(false);
    }
  });
});

describe("the shared SSRF corpus resolves to nothing fetchable", () => {
  it("refuses every IP-literal host in the corpus", () => {
    // Hostname-based entries are covered by the destination parser and DNS
    // resolution; this asserts the literal ones the classifier sees directly.
    const literals = SSRF_TARGETS
      .map((target) => { try { return new URL(target).hostname.replace(/^\[|\]$/g, ""); } catch { return ""; } })
      .filter((host) => isIpLiteral(host));
    expect(literals.length).toBeGreaterThan(4);
    for (const host of literals) {
      expect(isPublicInternetAddress(host), `${host} must be refused`).toBe(false);
    }
  });
});

function isIpLiteral(host: string): boolean {
  return /^[0-9.]+$/.test(host) || host.includes(":");
}

describe("the health check does not become a redirect follower", () => {
  it("treats a redirect as unreachable rather than chasing it", () => {
    // redirect: "manual" plus this predicate is what stops an allowed public
    // host from bouncing the fetch onto a private one.
    for (const status of [301, 302, 303, 307, 308]) {
      expect(isReachableExternalStatus(status), `${status} must not count as verified`).toBe(false);
    }
    for (const status of [200, 204, 401, 403, 404]) {
      expect(isReachableExternalStatus(status)).toBe(true);
    }
    for (const status of [500, 502, 503]) {
      expect(isReachableExternalStatus(status)).toBe(false);
    }
  });
});

/**
 * Spelling-independence.
 *
 * The first version of this classifier decided IPv6 by string prefix, and an
 * adversarial pass found three ways that was wrong: `fe80::8.8.8.8` looked
 * public because it ended in a public dotted quad, `2002:7f00::` was missed
 * because the 6to4 pattern demanded two groups, and `0:0:0:0:0:0:0:1` was not
 * the literal string "::1". One address has many spellings; its bytes have one.
 */
describe("IPv6 classification is spelling-independent", () => {
  it("catches loopback and unspecified however they are written", () => {
    for (const address of [
      "::1", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0001",
      "::", "0:0:0:0:0:0:0:0", "0000:0000:0000:0000:0000:0000:0000:0000"
    ]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("does not let a public dotted tail launder a private IPv6 prefix", () => {
    // fe80::8.8.8.8 is link-local. The embedded quad is irrelevant.
    for (const address of ["fe80::8.8.8.8", "fc00::8.8.8.8", "ff02::8.8.8.8", "fd12:3456::1.1.1.1"]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("catches every 6to4 spelling of a private address", () => {
    for (const address of ["2002:7f00:1::", "2002:7f00::", "2002:0a00:0001::", "2002:c0a8:0101::", "2002:a9fe:a9fe::"]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("catches NAT64 and mapped forms in hex as well as dotted notation", () => {
    for (const address of [
      "64:ff9b::7f00:1", "64:ff9b::127.0.0.1", "64:ff9b::a00:1",
      "::ffff:7f00:1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"
    ]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("catches unique-local and link-local across the whole range, not just one prefix", () => {
    for (const address of [
      "fc00::1", "fcff::1", "fd00::1", "fdff:ffff::1",
      "fe80::1", "fe90::1", "fea0::1", "feb0::1", "febf:ffff::1"
    ]) {
      expect(isPublicInternetAddress(address), `${address} must be refused`).toBe(false);
    }
  });

  it("still allows genuinely public addresses in every spelling", () => {
    for (const address of [
      "2606:4700:4700::1111", "2001:4860:4860::8888",
      "::ffff:8.8.8.8", "::ffff:808:808", "64:ff9b::8.8.8.8",
      "2002:0808:0808::", "2400:cb00::1", "fec0::1"
    ]) {
      expect(isPublicInternetAddress(address), `${address} must be allowed`).toBe(true);
    }
  });

  it("refuses anything it cannot parse rather than guessing", () => {
    for (const value of ["fe80::1%eth0", ":::1", "1:2:3:4:5:6:7:8:9", "gggg::1", "::ffff:999.1.1.1"]) {
      expect(isPublicInternetAddress(value), `${value} must be refused`).toBe(false);
    }
  });
});
