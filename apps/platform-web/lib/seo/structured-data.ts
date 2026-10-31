import { PLATFORM_HOMEPAGE_DESCRIPTION } from "./platform-positioning";

/**
 * Schema.org JSON-LD for the production homepage: who publishes mathnexa.com
 * (OnlineBusiness, schema.org's Organization subtype for "an online learning
 * platform") and the site itself (WebSite, the markup Google reads for the
 * site name shown in results).
 *
 * Facts only, each one already public on mathnexa.com:
 * - the name, the canonical origin and the app icon (app/icon1.png, 512 px);
 * - the description is the homepage's own visible lede, word for word;
 * - the support contact is the address /support shows (MVH_SUPPORT_EMAIL),
 *   and it is left out when that page shows none.
 *
 * Deliberately absent: an address, telephone, opening hours, prices, ratings,
 * reviews, awards, accreditation and social profiles. MathNexa is online only,
 * so LocalBusiness does not apply. A Software App rich result needs a rating
 * or review we do not have, so there is no WebApplication node either.
 */

export const MATHNEXA_ORIGIN = "https://mathnexa.com" as const;

const ORGANIZATION_ID = `${MATHNEXA_ORIGIN}/#organization`;
const WEBSITE_ID = `${MATHNEXA_ORIGIN}/#website`;

export const MATHNEXA_LOGO = Object.freeze({ path: "/icon1.png", width: 512, height: 512 });

type JsonLdNode = Readonly<Record<string, unknown>>;

export type HomeStructuredData = Readonly<{
  "@context": "https://schema.org";
  "@graph": readonly JsonLdNode[];
}>;

export function homeStructuredData({ supportEmail }: Readonly<{ supportEmail: string | null }>): HomeStructuredData {
  const organization: JsonLdNode = {
    "@type": "OnlineBusiness",
    "@id": ORGANIZATION_ID,
    name: "MathNexa",
    url: `${MATHNEXA_ORIGIN}/`,
    logo: {
      "@type": "ImageObject",
      url: `${MATHNEXA_ORIGIN}${MATHNEXA_LOGO.path}`,
      width: MATHNEXA_LOGO.width,
      height: MATHNEXA_LOGO.height
    },
    description: PLATFORM_HOMEPAGE_DESCRIPTION,
    ...(supportEmail ? {
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: supportEmail,
        url: `${MATHNEXA_ORIGIN}/support`
      }
    } : {})
  };
  const website: JsonLdNode = {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "MathNexa",
    url: `${MATHNEXA_ORIGIN}/`,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID }
  };
  return { "@context": "https://schema.org", "@graph": [organization, website] };
}
