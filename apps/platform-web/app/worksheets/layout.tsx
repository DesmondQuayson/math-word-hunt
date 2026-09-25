import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireProductAccess } from "@/lib/access/server";
import { WORKSHEET_GENERATOR_URL } from "@/lib/navigation/banner";

export const dynamic = "force-dynamic";

/**
 * The MathNexa entry for the ShowMe Math Worksheet Generator, gated exactly
 * like Online Math Prep: the same server-side product-access decision runs
 * here, above the page, so it is delivered as a real redirect.
 *
 * - anonymous → /access?next=/worksheets; unconfirmed → email confirmation;
 *   no entitlement → /subscription?next=/worksheets (the existing trial /
 *   subscription flow, which returns here once access exists);
 * - an entitled visitor (trial, subscription, grace, school code) is sent
 *   straight to the worksheet generator.
 *
 * The page below is never reached; it exists so the route resolves.
 */
export default async function WorksheetsLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireProductAccess("/worksheets");
  redirect(WORKSHEET_GENERATOR_URL);
  return children;
}
