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
