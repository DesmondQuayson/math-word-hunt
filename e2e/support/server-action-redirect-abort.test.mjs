// node --test e2e/support/server-action-redirect-abort.test.mjs
// The matcher may tolerate exactly one thing — a Server Action POST aborted by Chromium after a 2xx
// response that carries Next's `x-action-redirect` — and must keep reporting every other failure.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { isRedirectingServerActionAbort, trackFailedRequests } from "./server-action-redirect-abort.ts";

const redirectingAction = {
  method: "POST",
  failureText: "net::ERR_ABORTED",
  requestHeaders: { "next-action": "60984635aa9e2eef42c5f5bf8ed259da20690921", accept: "text/x-component" },
  response: { status: 200, headers: { "content-type": "text/x-component", "x-action-redirect": "/admin;push", "x-action-revalidated": "1" } }
};
const variant = (patch) => ({ ...redirectingAction, ...patch });

test("a redirecting Server Action aborted after its 200 response is ignored (Next.js 16.4)", () => {
  assert.equal(isRedirectingServerActionAbort(redirectingAction), true);
  assert.equal(isRedirectingServerActionAbort(variant({
    requestHeaders: { "Next-Action": "abc" },
    response: { status: 200, headers: { "X-Action-Redirect": "/admin/mfa;push" } }
  })), true, "header names are case-insensitive");
});

test("every other failure is still reported", () => {
  const cases = [
    ["a non-action POST abort", variant({ requestHeaders: { accept: "text/html" } })],
    ["a Server Action with an empty Next-Action header", variant({ requestHeaders: { "next-action": " " } })],
    ["a Server Action abort without a redirect", variant({ response: { status: 200, headers: { "content-type": "text/x-component" } } })],
    ["a Server Action that answered 500", variant({ response: { status: 500, headers: { "x-action-redirect": "/admin;push" } } })],
    ["a Server Action that answered 404", variant({ response: { status: 404, headers: { "x-action-redirect": "/admin;push" } } })],
    ["a Server Action that never got a response", variant({ response: null })],
    ["a Server Action network error", variant({ failureText: "net::ERR_CONNECTION_RESET" })],
    ["a failure with no error text", variant({ failureText: null })],
    ["a GET failure (navigation or RSC prefetch)", variant({ method: "GET" })]
  ];
  for (const [label, facts] of cases) assert.equal(isRedirectingServerActionAbort(facts), false, label);
});

function fakeRequest({ url, method, failureText, requestHeaders, response }) {
  return {
    url: () => url,
    method: () => method,
    failure: () => (failureText ? { errorText: failureText } : null),
    headers: () => requestHeaders,
    response: async () => (response ? { status: () => response.status, headers: () => response.headers } : null)
  };
}

test("trackFailedRequests reports every failed request except the redirecting action abort, after all are classified", async () => {
  const page = new EventEmitter();
  const tolerated = [];
  const failedRequests = trackFailedRequests(page, (line) => tolerated.push(line));
  page.emit("requestfailed", fakeRequest({ ...redirectingAction, url: "http://127.0.0.1:3000/admin/mfa" }));
  page.emit("requestfailed", fakeRequest({ ...variant({ method: "GET" }), url: "http://127.0.0.1:3000/games?_rsc=1" }));
  page.emit("requestfailed", fakeRequest({ ...variant({ response: { status: 500, headers: { "x-action-redirect": "/x;push" } } }), url: "http://127.0.0.1:3000/admin/sign-in" }));
  page.emit("requestfailed", fakeRequest({ ...variant({ requestHeaders: {} }), url: "http://127.0.0.1:3000/api/upload" }));
  page.emit("requestfailed", { ...fakeRequest({ ...redirectingAction, url: "http://127.0.0.1:3000/admin" }), response: async () => { throw new Error("target closed"); } });
  page.emit("requestfailed", { ...fakeRequest({ ...redirectingAction, url: "http://127.0.0.1:3000/admin/detached" }), headers: () => { throw new Error("request detached"); } });
  assert.deepEqual(await failedRequests(), ["/games", "/admin/sign-in", "/api/upload", "/admin", "/admin/detached"]);
  assert.deepEqual(tolerated, ["tolerated Next.js 16.4 redirecting Server Action abort: POST /admin/mfa -> /admin;push"]);
});
