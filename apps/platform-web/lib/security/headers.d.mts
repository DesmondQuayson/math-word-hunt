/**
 * Types for `headers.mjs`.
 *
 * The implementation is `.mjs` because `next.config.mjs` imports it before the
 * TypeScript pipeline exists, and this project sets `allowJs: false`. This
 * declaration lets the security test suite import the same module the shipped
 * config uses, instead of asserting against a duplicate of the policy.
 */
export type SecurityHeader = Readonly<{ key: string; value: string }>;

/** `developmentServer` is true only for `next dev` (Next's PHASE_DEVELOPMENT_SERVER). */
export type SecurityHeaderOptions = Readonly<{ developmentServer?: boolean }>;

export declare function buildContentSecurityPolicy(
  source?: Readonly<Record<string, string | undefined>>,
  options?: SecurityHeaderOptions
): string;

export declare function buildSecurityHeaders(
  source?: Readonly<Record<string, string | undefined>>,
  options?: SecurityHeaderOptions
): SecurityHeader[];
