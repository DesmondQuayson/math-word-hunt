/**
 * Why an email link (sign-up confirmation or password recovery) could not
 * sign someone in, as app/auth/callback/route.ts tells /sign-in.
 *
 * - "link-other-browser": the provider accepted the link and returned a code,
 *   but this browser could not exchange it. With the PKCE flow that almost
 *   always means the link was opened in a different browser or device from
 *   the one that asked for it; a sign-up confirmation is already recorded by
 *   then, so signing in here works.
 * - "link-expired": the provider refused the link itself (expired, or already
 *   used, sometimes by an email scanner that opened it first).
 * - "link-unusable": anything else.
 */
export const EMAIL_LINK_FAILURES = ["link-other-browser", "link-expired", "link-unusable"] as const;

export type EmailLinkFailure = (typeof EMAIL_LINK_FAILURES)[number];

const failures = new Set<string>(EMAIL_LINK_FAILURES);

export function isEmailLinkFailure(value: string | null | undefined): value is EmailLinkFailure {
  return typeof value === "string" && failures.has(value);
}

/**
 * The provider's own refusal of a link arrives as query parameters on the
 * redirect (error / error_code / error_description) and carries no code.
 */
export function classifyEmailLinkFailure(params: Readonly<{ code: string | null; providerError: string | null }>): EmailLinkFailure {
  if (params.code) return "link-other-browser";
  if (params.providerError) return "link-expired";
  return "link-unusable";
}
