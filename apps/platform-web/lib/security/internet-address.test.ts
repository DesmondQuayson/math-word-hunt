import { describe, expect, it } from "vitest";

import { classifyInternetAddress, isPublicInternetAddress } from "./internet-address";

describe("internet address classification", () => {
  it("names the reason an address is refused, so an SSRF event can carry the class and never the address", () => {
    expect(classifyInternetAddress("127.0.0.1")).toBe("loopback");
    expect(classifyInternetAddress("10.1.2.3")).toBe("private");
    expect(classifyInternetAddress("172.16.0.1")).toBe("private");
    expect(classifyInternetAddress("192.168.1.1")).toBe("private");
    expect(classifyInternetAddress("100.64.0.1")).toBe("private");
    expect(classifyInternetAddress("169.254.169.254")).toBe("link-local");
    expect(classifyInternetAddress("224.0.0.1")).toBe("multicast");
    expect(classifyInternetAddress("240.0.0.1")).toBe("reserved");
    expect(classifyInternetAddress("0.0.0.0")).toBe("unspecified");
    expect(classifyInternetAddress("192.0.2.1")).toBe("reserved");
    expect(classifyInternetAddress("8.8.8.8")).toBe("public");
    expect(classifyInternetAddress("::1")).toBe("loopback");
    expect(classifyInternetAddress("0:0:0:0:0:0:0:1")).toBe("loopback");
    expect(classifyInternetAddress("::")).toBe("unspecified");
    expect(classifyInternetAddress("::ffff:127.0.0.1")).toBe("loopback");
    expect(classifyInternetAddress("::ffff:10.0.0.1")).toBe("private");
    expect(classifyInternetAddress("64:ff9b::7f00:1")).toBe("loopback");
    expect(classifyInternetAddress("2002:7f00:0001::")).toBe("loopback");
    expect(classifyInternetAddress("fc00::1")).toBe("private");
    expect(classifyInternetAddress("FE80::1")).toBe("link-local");
    expect(classifyInternetAddress("fe80::8.8.8.8")).toBe("link-local");
    expect(classifyInternetAddress("ff02::1")).toBe("multicast");
    expect(classifyInternetAddress("100::1")).toBe("reserved");
    expect(classifyInternetAddress("2606:4700::1111")).toBe("public");
    expect(classifyInternetAddress("not-an-ip")).toBe("invalid");
    expect(classifyInternetAddress("")).toBe("invalid");
  });

  it("keeps the boolean contract every existing caller relies on", () => {
    for (const address of ["8.8.8.8", "2606:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicInternetAddress(address), address).toBe(true);
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.1.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "", "localhost"]) {
      expect(isPublicInternetAddress(address), address).toBe(false);
    }
  });
});
