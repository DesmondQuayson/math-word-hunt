/**
 * Online Math Prep's grades, as the homepage grade selector links to them.
 *
 * Online Math Prep is ShowMe Math (showme.mathnexa.com), whose grade pages
 * are /grades/1 to /grades/8 (ShowMe src/app/grades/[grade]/page.tsx; Grades
 * 1–2 since ShowMe v1.2.25). A grade link never names the ShowMe host: it goes
 * through MathNexa's pass route (app/map-prep/pass/route.ts) with the grade's
 * path as `to`, so the same server-side check as every other Online Math Prep
 * entry decides what happens:
 * - a trial, a subscription (including grace and a scheduled cancellation) or
 *   a school access code: a pass is issued and the visitor lands on that
 *   grade;
 * - signed out: /access?next=/map-prep; email not confirmed:
 *   /confirmation-required?next=/map-prep; no access: /subscription?next=/map-prep.
 *   The grade is remembered for 30 minutes in that browser and used when they
 *   come back through Online Math Prep (lib/showme-access/pass.ts).
 *
 * No `site=staging`: a homepage link always means the production ShowMe site.
 * Plain logic, nothing secret: these are public addresses.
 */

export const ONLINE_MATH_PREP_GRADES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8] as const);
export type OnlineMathPrepGrade = (typeof ONLINE_MATH_PREP_GRADES)[number];

/** The grade's page on ShowMe: a path only, accepted unchanged by safeShowMeReturnPath. */
export function onlineMathPrepGradePath(grade: OnlineMathPrepGrade): string {
  return `/grades/${grade}`;
}

/** The homepage link for a grade: MathNexa's pass route, which checks access first. */
export function onlineMathPrepGradeHref(grade: OnlineMathPrepGrade): string {
  return `/map-prep/pass?to=${onlineMathPrepGradePath(grade)}`;
}
