import type { Metadata } from "next";

import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";

import { MATHNEXA_LOGO } from "./structured-data";

/**
 * Search and social metadata for the indexable public pages of the production
 * platform (the sitemap routes). Before this, every one of them inherited the
 * homepage description, so seven pages shared one meta description.
 *
 * Each description summarises what that page actually says. Prices and
 * durations come from the same constants the billing code uses, so the
 * snippets can never quote a different price or trial length than the terms.
 */

const currency = COMMERCIAL_POLICY.currency.toUpperCase();

/** "$5.99 USD", from the billing policy. */
export const MONTHLY_PRICE_LABEL = `${new Intl.NumberFormat("en-US", { style: "currency", currency }).format(COMMERCIAL_POLICY.amountMinorUnits / 100)} ${currency}`;

/** 24, from the billing policy. */
export const TRIAL_HOURS = COMMERCIAL_POLICY.trialSeconds / 3600;

/**
 * The social preview image for every page: the MathNexa app icon, an existing
 * approved asset. It is square, so cards use the small "summary" layout and
 * nothing is cropped.
 */
export const SOCIAL_PREVIEW_IMAGE = Object.freeze({
  url: MATHNEXA_LOGO.path,
  width: MATHNEXA_LOGO.width,
  height: MATHNEXA_LOGO.height,
  alt: "MathNexa"
});

export const PLATFORM_OPEN_GRAPH = Object.freeze({
  siteName: "MathNexa",
  type: "website" as const,
  images: [SOCIAL_PREVIEW_IMAGE]
});

type PublicPageSeo = Readonly<{ title: string | { absolute: string }; description: string }>;

export const PUBLIC_PAGE_SEO = Object.freeze({
  "/about": {
    title: { absolute: "About MathNexa: Online Math Prep for Grades 3–8" },
    description: "What a MathNexa subscription includes: online math prep for Grades 3–8, math games, Homework PDFs, Quiz PDFs and a worksheet generator, and how to start."
  },
  "/help": {
    title: "Help with accounts and access",
    description: "How to create a MathNexa account, start the free trial, play Math Tug of War for free, use a school access code, and manage your subscription."
  },
  "/support": {
    title: "Contact support",
    description: "Get help with your MathNexa account or subscription: manage billing, request a refund review, reset your password, or email MathNexa support."
  },
  "/privacy": {
    title: "Privacy notice",
    description: "The minimum account and subscription data MathNexa uses, the service providers that process it, how long it is kept, and how to request deletion."
  },
  "/terms": {
    title: "Subscription terms",
    description: `MathNexa subscription terms: ${MONTHLY_PRICE_LABEL} a month after a ${TRIAL_HOURS}-hour trial, automatic renewal, cancellation, refund review and account deletion.`
  },
  "/accessibility": {
    title: "Accessibility",
    description: "How MathNexa works with a keyboard, mouse or touch screen, with zoom and small screens, and with reduced-motion and forced-colors settings."
  },
  "/status": {
    title: "Service status",
    description: "Current MathNexa service status: whether the platform is operational, search indexing is enabled, and live payments are available."
  }
} satisfies Record<string, PublicPageSeo>);

export type PublicSeoPath = keyof typeof PUBLIC_PAGE_SEO;

/** Title, description and social tags (with the page's own og:url) for one public page. */
export function publicPageMetadata(path: PublicSeoPath): Metadata {
  const page: PublicPageSeo = PUBLIC_PAGE_SEO[path];
  return {
    title: page.title,
    description: page.description,
    openGraph: { ...PLATFORM_OPEN_GRAPH, url: path }
  };
}
