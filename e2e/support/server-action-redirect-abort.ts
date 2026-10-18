import type { Page, Request } from "@playwright/test";

/**
 * Failed-request tracking that tolerates exactly one Next.js 16.4 behaviour and nothing else.
 *
 * When a Server Action ends in `redirect()`, the server answers the action POST with 200, an
 * `x-action-redirect` header (plus any Set-Cookie) and a body that streams the redirect target's RSC
 * payload. From Next.js 16.4 the client router acts on that header as soon as the headers arrive and
 * navigates, abandoning the rest of the body, so Chromium reports the POST as `net::ERR_ABORTED` even
 * though the action ran and its cookies were applied (16.3.x read the body to the end). Seen on the
 * admin sign-in and TOTP verify actions; see docs/security/nextjs-16.4.2-security-hotfix.md, finding A.
 *
 * Every other failed request is still reported: other aborts, network errors, GETs, actions without a
 * redirect, and anything whose response was not a 2xx.
 */
export type FailedRequestFacts = {
  method: string;
  failureText: string | null;
  requestHeaders: Record<string, string>;
  response: { status: number; headers: Record<string, string> } | null;
};

const header = (headers: Record<string, string>, name: string) =>
  Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1]?.trim() ?? "";

export function isRedirectingServerActionAbort(facts: FailedRequestFacts): boolean {
  return facts.method.toUpperCase() === "POST"
    && facts.failureText === "net::ERR_ABORTED"
    && header(facts.requestHeaders, "next-action") !== ""
    && facts.response !== null
    && facts.response.status >= 200 && facts.response.status < 300
    && header(facts.response.headers, "x-action-redirect") !== "";
}

export async function failedRequestFacts(request: Request): Promise<FailedRequestFacts> {
  const response = await request.response().catch(() => null);
  return {
    method: request.method(),
    failureText: request.failure()?.errorText ?? null,
    requestHeaders: request.headers(),
    response: response ? { status: response.status(), headers: response.headers() } : null
  };
}

/**
 * Starts recording the page's failed requests (pathnames) and returns a function that resolves to the
 * ones that count. Await it in the final assertion so no classification is still pending. Each tolerated
 * abort is logged, so a run shows whether the 16.4 behaviour occurred.
 */
export function trackFailedRequests(page: Page, log: (line: string) => void = (line) => console.log(line)): () => Promise<string[]> {
  const pending: Promise<string | null>[] = [];
  page.on("requestfailed", (request) => {
    const path = new URL(request.url()).pathname;
    pending.push(failedRequestFacts(request).then((facts) => {
      if (!isRedirectingServerActionAbort(facts)) return path;
      log(`tolerated Next.js 16.4 redirecting Server Action abort: POST ${path} -> ${facts.response?.headers["x-action-redirect"] ?? "?"}`);
      return null;
    }, () => path));
  });
  return async () => (await Promise.all(pending)).filter((path): path is string => path !== null);
}
