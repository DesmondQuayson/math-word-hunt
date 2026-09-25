/**
 * The MathNexa banner (owner-approved structure, 2026-09-24).
 *
 * Six product destinations are permanently visible in the banner; the account
 * actions live in the account menu. Nothing here decides access: every
 * internal destination re-checks entitlement on the server (the anonymous
 * visitor is sent to /access?next=…), and the two ShowMe destinations are the
 * production product hosts.
 */
export type BannerLink = Readonly<{
  href: string;
  label: string;
  /** A first-party product on another host (plain anchor, same tab). */
  external?: boolean;
}>;

/** Worksheet Generator opens the ShowMe Math worksheet generator directly. */
export const WORKSHEET_GENERATOR_URL = "https://showme.mathnexa.com/worksheets" as const;

/**
 * Online Math Prep keeps the app's own entry route: app/map-prep/layout.tsx
 * checks entitlement and sends an entitled visitor straight to the configured
 * ShowMe destination (showme.mathnexa.com) with one server round trip.
 */
export const PRODUCT_NAVIGATION: readonly BannerLink[] = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Math Games" },
  { href: "/map-prep", label: "Online Math Prep" },
  { href: "/homework", label: "Homework PDFs" },
  { href: "/quizzes", label: "Quiz PDFs" },
  { href: WORKSHEET_GENERATOR_URL, label: "Worksheet Generator", external: true }
];

/** Account actions; "Sign out" / "Exit authorized access" is added by the header for a signed-in session. */
export const ACCOUNT_NAVIGATION: readonly BannerLink[] = [
  { href: "/subscription", label: "Subscription" },
  { href: "/account", label: "My Account" }
];

/** Home matches exactly; every other internal destination also matches its sub-routes. */
export function isCurrentBannerPath(href: string, pathname: string): boolean {
  if (href.startsWith("http")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
