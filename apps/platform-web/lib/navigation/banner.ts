/**
 * The MathNexa banner (owner-approved structure, 2026-09-24; worksheet gate,
 * mobile grid and permanent authorized-code entry hotfix, 2026-09-25).
 *
 * Six product destinations are permanently visible in the banner; the account
 * actions live in the account menu. Nothing here decides access: every
 * destination is an app route that re-checks entitlement on the server (the
 * anonymous visitor is sent to /access?next=…, a signed-in visitor without
 * access to /subscription?next=…). The banner never links off-site directly.
 */
export type BannerLink = Readonly<{
  href: string;
  label: string;
}>;

/**
 * Where the app's /worksheets entry sends an entitled visitor: the ShowMe Math
 * worksheet generator. app/worksheets/layout.tsx is the only place that
 * redirects here, after requireProductAccess("/worksheets") has passed.
 */
export const WORKSHEET_GENERATOR_URL = "https://showme.mathnexa.com/worksheets" as const;

/**
 * Online Math Prep and Worksheet Generator keep app-owned entry routes:
 * app/map-prep/layout.tsx and app/worksheets/layout.tsx check entitlement and
 * send an entitled visitor straight to the ShowMe destination with one server
 * round trip; everyone else enters the existing access / subscription flow
 * with the product remembered as `next`.
 */
export const PRODUCT_NAVIGATION: readonly BannerLink[] = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Math Games" },
  { href: "/map-prep", label: "Online Math Prep" },
  { href: "/homework", label: "Homework PDFs" },
  { href: "/quizzes", label: "Quiz PDFs" },
  { href: "/worksheets", label: "Worksheet Generator" }
];

/** Account actions; "Sign out" / "Exit authorized access" is added by the header for a signed-in session. */
export const ACCOUNT_NAVIGATION: readonly BannerLink[] = [
  { href: "/subscription", label: "Subscription" },
  { href: "/account", label: "My Account" }
];

/**
 * The homepage element that holds the authorized-code form (or, for a session
 * that already entered a code, its exit control). The banner's permanent
 * "Authorize Code" link points at it from every page.
 */
export const AUTHORIZED_ACCESS_ANCHOR = "authorized-access" as const;

/** Home matches exactly; every other destination also matches its sub-routes. */
export function isCurrentBannerPath(href: string, pathname: string): boolean {
  if (href.startsWith("http")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
