/**
 * Homepage-only copy for the online-math-prep homepage (2026-10 redesign).
 *
 * Shared positioning stays in lib/seo/platform-positioning.ts and is NOT
 * duplicated here: the SEO title, the meta description (shown on the homepage
 * as the hero lede), the audience line, the /about page and every product
 * label keep reading from there. Only words that exist on this page live here.
 *
 * Truthfulness rules: no statistics, no testimonials, no feature the products
 * do not have. The worked problem is an example, labelled as one.
 */

export const HOME_EYEBROW = "Online math prep · Grades 3–8";
export const HOME_HEADLINE_LEAD = "Online math prep that ";
// The comma rides inside the mark so accessible-name spacing between the runs
// can only ever fall where the sentence already has a space.
export const HOME_HEADLINE_MARK = "shows the thinking,";
export const HOME_HEADLINE_TAIL = " not just the answer.";
export const HOME_HEADLINE = HOME_HEADLINE_LEAD + HOME_HEADLINE_MARK + HOME_HEADLINE_TAIL;
