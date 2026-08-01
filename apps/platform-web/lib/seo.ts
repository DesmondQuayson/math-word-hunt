import type { Metadata } from "next";

export const MATHNEXA_ORIGIN = "https://mathnexa.com" as const;
export const MATHNEXA_SITE_NAME = "MathNexa" as const;
export const MATHNEXA_SOCIAL_IMAGE = "/opengraph-image" as const;

export const PUBLIC_SITEMAP_PATHS = ["/", "/pricing", "/help", "/privacy", "/terms"] as const;

export const RESTRICTED_ROBOTS_PATHS = [
  "/account",
  "/api",
  "/auth",
  "/checkout",
  "/forgot-password",
  "/not-launched",
  "/pilot",
  "/sign-in",
  "/sign-up",
  "/status",
  "/subscription",
  "/teacher",
  "/update-password"
] as const;

export const PUBLIC_PAGE_SEO = {
  home: {
    path: "/",
    title: "MathNexa | Interactive Math Vocabulary Game",
    description: "Play a browser-based interactive math vocabulary game with Grade 6 math vocabulary practice and other available lessons."
  },
  pricing: {
    path: "/pricing",
    title: "MathNexa Pricing | Current Public Game Access",
    description: "See the current availability of MathNexa online math vocabulary practice and which account and payment features have not launched."
  },
  help: {
    path: "/help",
    title: "MathNexa Help | Math Vocabulary Game Guide",
    description: "Learn how to start the browser-based Grade 6 math vocabulary game, choose an available lesson, and use keyboard or pointer controls."
  },
  privacy: {
    path: "/privacy",
    title: "MathNexa Privacy | Public Game Data Practices",
    description: "Review the data boundaries for MathNexa public online math vocabulary practice, including the current no-account experience."
  },
  terms: {
    path: "/terms",
    title: "MathNexa Terms | Public Game Use",
    description: "Read the terms for using the public MathNexa browser-based math learning game and related informational pages."
  },
  play: {
    path: "/play",
    title: "Play MathNexa | Math Vocabulary Hunt",
    description: "Open the current interactive math vocabulary game and choose an available grade, lesson, and classroom round."
  },
  about: {
    path: "/about",
    title: "About MathNexa | Online Math Vocabulary Practice",
    description: "Learn how MathNexa supports discussion-first online math vocabulary practice with keyboard, pointer, touch, and shared displays."
  },
  accessibility: {
    path: "/accessibility",
    title: "MathNexa Accessibility | Inclusive Game Controls",
    description: "Review keyboard, pointer, touch, reduced-motion, forced-colors, responsive, and audio fallback behavior in MathNexa."
  }
} as const;

export type PublicPageSeoKey = keyof typeof PUBLIC_PAGE_SEO;

export function getPublicPageMetadata(key: PublicPageSeoKey): Metadata {
  const page = PUBLIC_PAGE_SEO[key];
  const canonical = new URL(page.path, MATHNEXA_ORIGIN).toString();
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: MATHNEXA_SITE_NAME,
      title: page.title,
      description: page.description,
      url: canonical,
      images: [{ url: MATHNEXA_SOCIAL_IMAGE, width: 1200, height: 630, alt: "MathNexa math vocabulary trail" }]
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [MATHNEXA_SOCIAL_IMAGE]
    }
  };
}

export function getMathNexaStructuredData() {
  const organizationId = `${MATHNEXA_ORIGIN}/#organization`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${MATHNEXA_ORIGIN}/#website`,
      url: MATHNEXA_ORIGIN,
      name: MATHNEXA_SITE_NAME,
      description: PUBLIC_PAGE_SEO.home.description,
      inLanguage: "en-US",
      publisher: { "@id": organizationId }
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organizationId,
      name: MATHNEXA_SITE_NAME,
      url: MATHNEXA_ORIGIN,
      logo: { "@type": "ImageObject", url: `${MATHNEXA_ORIGIN}/icon.svg` }
    }
  ] as const;
}
