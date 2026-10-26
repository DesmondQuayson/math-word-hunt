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

export const PREP_FLOW_STEPS = [
  { key: "learn", title: "Learn", body: "Start with a clear, visual explanation of one idea." },
  { key: "practice", title: "Practice", body: "Work through problems on that same idea, on a laptop, tablet or phone." },
  { key: "review", title: "Review", body: "Come back to the topic and check what stuck before a quiz or test." },
  {
    key: "worksheet",
    title: "Worksheet Generator",
    body: "Print a fresh worksheet for practice away from the screen.",
    // The existing gated route: the same destination as the header link.
    link: { href: "/worksheets", label: "Open the Worksheet Generator" }
  }
] as const;

export type PrepFlowStepKey = (typeof PREP_FLOW_STEPS)[number]["key"];
