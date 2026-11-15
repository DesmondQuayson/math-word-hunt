// @vitest-environment node
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createShowMePass,
  decodeShowMeReturn,
  encodeShowMeReturn,
  getShowMeAccessSecret,
  safeShowMeReturnPath,
  showMeDestination,
  showMeSite,
  SHOWME_PASS_DURATION_SECONDS,
  SHOWME_SITES,
  verifyShowMePass
} from "./pass";

// The same vector is asserted in the ShowMe repository
// (tests/unit/hosting/access-gate.test.ts), so the two sides cannot drift.
const VECTOR_SECRET = "showme-pass-test-vector-secret-0123456789abcdef";
const VECTOR_ISSUED_AT = 1_800_000_000;
const VECTOR_PASS = "eyJ2IjoxLCJpYXQiOjE4MDAwMDAwMDAsImV4cCI6MTgwMDA0MzIwMH0.nNQhAUAKen9NPorkx2CcmOg1nSN8vpboY13w6BH_Lms";
const at = (seconds: number) => new Date(seconds * 1000);

const forge = (payload: unknown, secret = VECTOR_SECRET) => {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
};

describe("the ShowMe access pass", () => {
  it("is the shared test vector, byte for byte", () => {
    expect(createShowMePass(VECTOR_SECRET, at(VECTOR_ISSUED_AT))).toBe(VECTOR_PASS);
    expect(verifyShowMePass(VECTOR_PASS, VECTOR_SECRET, at(VECTOR_ISSUED_AT + 1))).toBe(true);
  });

  it("holds a version and two times, twelve hours apart, and nothing about a person", () => {
    const pass = createShowMePass(VECTOR_SECRET, at(VECTOR_ISSUED_AT))!;
    const payload = JSON.parse(Buffer.from(pass.split(".")[0]!, "base64url").toString("utf8"));
    expect(payload).toEqual({ v: 1, iat: VECTOR_ISSUED_AT, exp: VECTOR_ISSUED_AT + 12 * 60 * 60 });
    expect(SHOWME_PASS_DURATION_SECONDS).toBe(43_200);
  });

  it("is valid until it expires, and not a second longer", () => {
    expect(verifyShowMePass(VECTOR_PASS, VECTOR_SECRET, at(VECTOR_ISSUED_AT + 43_199))).toBe(true);
    expect(verifyShowMePass(VECTOR_PASS, VECTOR_SECRET, at(VECTOR_ISSUED_AT + 43_200))).toBe(false);
    expect(verifyShowMePass(VECTOR_PASS, VECTOR_SECRET, at(VECTOR_ISSUED_AT + 90_000))).toBe(false);
  });

  it("is refused before its time, apart from a minute of clock difference", () => {
    expect(verifyShowMePass(VECTOR_PASS, VECTOR_SECRET, at(VECTOR_ISSUED_AT - 60))).toBe(true);
    expect(verifyShowMePass(VECTOR_PASS, VECTOR_SECRET, at(VECTOR_ISSUED_AT - 61))).toBe(false);
  });

  it("is refused when signed with another secret, altered, or reshaped", () => {
    const now = at(VECTOR_ISSUED_AT + 10);
    const [body, signature] = VECTOR_PASS.split(".") as [string, string];
    for (const value of [
      createShowMePass("another-secret-another-secret-another-secret", at(VECTOR_ISSUED_AT))!,
      `${body}.${signature.slice(0, -2)}AA`,
      `${body.slice(0, -2)}AA.${signature}`,
      `${body}.`,
      `.${signature}`,
      body,
      `${body}.${signature}.${signature}`,
      `${body}.${signature} `,
      "",
      "x".repeat(700)
    ]) {
      expect(verifyShowMePass(value, VECTOR_SECRET, now), value.slice(0, 40)).toBe(false);
    }
    expect(verifyShowMePass(null, VECTOR_SECRET, now)).toBe(false);
    expect(verifyShowMePass(undefined, VECTOR_SECRET, now)).toBe(false);
  });

  it("is refused when correctly signed but not the agreed shape", () => {
    const now = at(VECTOR_ISSUED_AT + 10);
    const iat = VECTOR_ISSUED_AT;
    for (const payload of [
      { v: 1, iat, exp: iat + 30 * 24 * 60 * 60 },
      { v: 1, iat, exp: iat + 43_199 },
      { v: 2, iat, exp: iat + 43_200 },
      { v: 1, iat, exp: iat + 43_200, sub: "someone" },
      { v: 1, iat, exp: iat + 43_200, admin: true },
      { v: 1, iat: String(iat), exp: iat + 43_200 },
      { v: 1, iat: iat + 0.5, exp: iat + 43_200.5 },
      { v: 1, exp: iat + 43_200 },
      [1, iat, iat + 43_200],
      null,
      "pass"
    ]) {
      expect(verifyShowMePass(forge(payload), VECTOR_SECRET, now), JSON.stringify(payload)).toBe(false);
    }
  });

  it("is not issued or accepted without a real secret", () => {
    expect(createShowMePass("short", at(VECTOR_ISSUED_AT))).toBeNull();
    expect(verifyShowMePass(VECTOR_PASS, "short", at(VECTOR_ISSUED_AT + 1))).toBe(false);
  });
});

describe("the shared secret", () => {
  it("is read from MVH_SHOWME_ACCESS_SECRET, trimmed", () => {
    expect(getShowMeAccessSecret({ MVH_SHOWME_ACCESS_SECRET: `  ${VECTOR_SECRET}\n` })).toBe(VECTOR_SECRET);
  });

  it("is absent when missing, short, too long or not printable", () => {
    for (const value of [undefined, "", "   ", "x".repeat(31), "x".repeat(257), `${"x".repeat(40)} with spaces`, `${"x".repeat(40)}é`]) {
      expect(getShowMeAccessSecret({ MVH_SHOWME_ACCESS_SECRET: value }), String(value).slice(0, 20)).toBeNull();
    }
  });
});

describe("where a visitor with access is sent", () => {
  it("is one of the two ShowMe sites, chosen by name", () => {
    expect(SHOWME_SITES).toEqual({ production: "https://showme.mathnexa.com", staging: "https://showme-staging.mathnexa.com" });
    expect(showMeSite("staging")).toBe("staging");
    for (const value of [null, undefined, "", "production", "Staging", "https://evil.example", "showme-staging.mathnexa.com", 1]) {
      expect(showMeSite(value)).toBe("production");
    }
  });

  it("keeps a plain path on ShowMe, with its query string", () => {
    for (const path of ["/", "/grades", "/grades/6", "/grades/6/ratios/unit-rates/practice", "/worksheets", "/assignment?a=AbC-123_x.y~z&x=1", "/teacher/groups/g-1", "/present/review?skill=g6.rp.1"]) {
      expect(safeShowMeReturnPath(path)).toBe(path);
      expect(showMeDestination("production", path)).toBe(`https://showme.mathnexa.com${path}`);
      expect(showMeDestination("staging", path)).toBe(`https://showme-staging.mathnexa.com${path}`);
    }
  });

  it("turns anything that is not a plain path into the home page", () => {
    for (const value of [
      null, undefined, 42, "", "grades/6", "//evil.example", "//evil.example/grades", "/\\evil.example", "\\\\evil.example",
      "https://evil.example/", "https://showme.mathnexa.com/grades", "javascript:alert(1)", "/grades#fragment", "/grades\nSet-Cookie: x=1",
      "/grades\r\n", "/grades 6", "/grades\t6", "/grädes", "/grades/../../etc", "/./grades", "/grades/<script>", "/@evil.example",
      `/${"x".repeat(1500)}`
    ]) {
      const result = safeShowMeReturnPath(value);
      if (value === "/@evil.example") {
        // Still a path on ShowMe: the origin is fixed, so "@" cannot change the host.
        expect(showMeDestination("production", result)).toBe("https://showme.mathnexa.com/@evil.example");
        continue;
      }
      expect(result, String(value).slice(0, 40)).toBe("/");
    }
  });

  it("can never leave the ShowMe origin, whatever is asked for", () => {
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "/%2F%2Fevil.example", "/..%2F..%2Fevil", "/@evil.example", "/grades?next=https://evil.example"]) {
      for (const site of ["production", "staging"] as const) {
        const destination = new URL(showMeDestination(site, value));
        expect(destination.origin, value).toBe(SHOWME_SITES[site]);
        expect(destination.username + destination.password).toBe("");
      }
    }
  });
});

describe("remembering where the visitor wanted to go", () => {
  it("round-trips a site and a path", () => {
    for (const [site, path] of [["production", "/assignment?a=AbC-123"], ["staging", "/grades/6"], ["production", "/"]] as const) {
      expect(decodeShowMeReturn(encodeShowMeReturn(site, path))).toEqual({ site, path });
    }
  });

  it("refuses anything it did not write", () => {
    const evil = Buffer.from("//evil.example", "utf8").toString("base64url");
    for (const value of [null, undefined, "", "x", "p.", "q.Lw", `p.${evil}`, `s.${Buffer.from("https://evil.example", "utf8").toString("base64url")}`, "p.!!!", `p.${"A".repeat(3000)}`]) {
      expect(decodeShowMeReturn(value), String(value).slice(0, 30)).toBeNull();
    }
  });
});
