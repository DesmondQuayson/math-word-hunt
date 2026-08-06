import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMapPrepDestinationRedirect,
  assertMapPrepLaunchRedirect,
  assertMapPrepRedirectSafe
} from "./phase10-map-prep-redirect-contract.mjs";

const origin = "https://mathnexa-platform-staging.vercel.app";

test("MAP Prep uses the exact internal launch route with any accepted redirect status", () => {
  for (const status of [302, 303, 307, 308]) {
    assert.equal(assertMapPrepLaunchRedirect({ status, location: "/map-prep/launch", origin }), `${origin}/map-prep/launch`);
  }
  for (const location of ["/map-prep", "/map-prep/launch?destination=https://evil.example", "//evil.example/map-prep/launch", "/checkout", "/subscription?next=/map-prep"]) {
    assert.throws(() => assertMapPrepLaunchRedirect({ status: 303, location, origin }), /launch-mismatch/);
  }
  assert.throws(() => assertMapPrepLaunchRedirect({ status: 301, location: "/map-prep/launch", origin }), /redirect-status/);
});

test("entitled MAP Prep launch reaches only the exact approved HTTPS destination", () => {
  const expectedDestination = "https://example.com/approved/path?mode=practice";
  assert.equal(assertMapPrepDestinationRedirect({ status: 303, location: expectedDestination, origin, expectedDestination }), expectedDestination);
  for (const location of [
    "https://evil.example/approved/path?mode=practice",
    "https://example.com/other/path?mode=practice",
    "https://example.com/approved/path?mode=practice&next=https://evil.example",
    "https://example.com/%2f%2fevil.example",
    "//example.com/approved/path?mode=practice",
    "http://example.com/approved/path?mode=practice"
  ]) {
    assert.throws(() => assertMapPrepDestinationRedirect({ status: 303, location, origin, expectedDestination }), /destination-mismatch/);
  }
});

test("redirect evidence cannot expose verification secrets", () => {
  assert.equal(assertMapPrepRedirectSafe({ values: ["/map-prep/launch", ""], secrets: ["private-token"] }), true);
  assert.throws(() => assertMapPrepRedirectSafe({ values: ["redirect private-token"], secrets: ["private-token"] }), /secret-exposure/);
});
