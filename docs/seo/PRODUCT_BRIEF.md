# MathNexa product evidence

Updated November 26, 2026, against refreshed source commit
`4d8ad62a706e225e364bb6c8958e4feb4d94da30` (v1.2.69). This is a source inventory,
not a verified live product catalog. Recheck production before using any claim
in public copy.

| Item | Evidence | Current confidence |
| --- | --- | --- |
| Main brand/domain | `apps/platform-web/app/sitemap.ts` uses `https://mathnexa.com` | Verified in source; live delivery checked separately |
| Intended audience | `components/public/teacher-first-home.tsx`: teacher-led resources, useful for families | Verified source messaging |
| Resource families | `lib/seo/platform-positioning.ts`: Math Games, Online Math Prep for Grades 1–8, Homework PDFs, Quiz PDFs, worksheet generator | Verified source messaging; published inventory remains dynamic |
| Math prep positioning | Online Math Prep is the product; Missouri MAP-style Grades 3–8 alignment is a supported use case | Preserve broader positioning and independent-product/non-affiliation language |
| Games | Homepage and public game pages derive published/free games from the catalog and access policy | Do not infer current publication or free access from old screenshots/source branches |
| Homework and quizzes | `lib/resources/catalog.ts` loads published taxonomy/resources and answer-key file roles | Available grades/topics/files require live catalog evidence |
| Protected libraries | `/games`, `/homework`, `/quizzes`, `/map-prep` call `requireProductAccess` | Verified access boundary; excluded from unattended crawl |
| Public product pages | `/online-math-prep`, `/math-games`, `/math-games/math-tug-of-war`, `/homework-pdfs`, `/quiz-pdfs` in `lib/seo/product-pages.ts` | Existing indexable explanations; improve these before creating competing pages |
| ShowMe | The owner identified `https://showme.mathnexa.com`; MAP Prep destination is CMS-configured | Public homepage and sitemap returned 401 on Nov 27 from a hosted audit; source repository and intended public coverage remain unverified |
| Pricing and trials | `lib/seo/public-pages.ts` derives price and trial text from shared commercial policy | Live price/terms remain to be checked; do not quote legacy environment branches as current evidence |
| Devices | Homepage source mentions phones, laptops, tablets, and shared displays | Marketing text is not a device-test result; verify behavior before making compatibility claims |

Paths in the table are relative to `apps/platform-web` unless fully specified.
The production homepage is selected by `isProductionPlatformMode()` in
`apps/platform-web/app/page.tsx`. Other historical environment branches and phase
documents must not be mistaken for current production behavior.

Existing SEO work must be retained: root `metadataBase` and per-route canonical
configuration, page-specific descriptions, product landing pages, structured
data, production-aware sitemap, and environment-aware crawl policy. The
production `/about` page already describes the subscription platform. Early
findings from the stale local checkout (`4a22720`) about missing canonicals or an
outdated production About page were superseded by the remote refresh; do not
propose those fixes again.

`lib/environment/crawl-policy.ts` distinguishes search/answer crawlers from
AI-training crawlers and preserves the owner's training opt-outs. Do not change
these preferences merely to improve a toolkit score. Existing positioning notes
in `docs/homepage-positioning-seo-v1.md` and
`docs/homepage-positioning-seo-v2-performance.md` are prior work, not fresh live
measurement.

The business objective is relevant teacher/family visits and genuine paid
subscriptions through useful, accurate resources. Rankings, AI citations, links,
traffic, and sales are outcomes to measure, not guarantees. Never use student
identities, invented endorsements, fabricated results, or protected content as
marketing evidence.
