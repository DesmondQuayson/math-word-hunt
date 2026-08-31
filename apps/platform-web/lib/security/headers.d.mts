/**
 * Types for `headers.mjs`.
 *
 * The implementation is `.mjs` because `next.config.mjs` imports it before the
 * TypeScript pipeline exists, and this project sets `allowJs: false`. This
 * declaration lets the security test suite import the same module the shipped
 * config uses, instead of asserting against a duplicate of the policy.
 */
export type SecurityHeader = Readonly<{ key: string; value: string }>;

export declare function buildContentSecurityPolicy(
  source?: Readonly<Record<string, string | undefined>>
): string;

export declare function buildSecurityHeaders(
  source?: Readonly<Record<string, string | undefined>>
): SecurityHeader[];
