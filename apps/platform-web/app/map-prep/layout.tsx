import type { ReactNode } from "react";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { recordAggregateSignal } from "@/lib/operations/server";
import { loadMapPrepDestination } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";

export const dynamic = "force-dynamic";

/**
 * Speed V2. The whole Online Math Prep decision happens here, ABOVE the page's
 * loading boundary, so it is delivered as a real HTTP redirect for document
 * requests and as a redirect payload for client navigations:
 *
 * - the entitlement decision (never cached, still server-side) and the
 *   one-minute-cached destination lookup run in parallel;
 * - an entitled visitor is sent straight to the approved destination, one
 *   server execution per click (the former hop through /map-prep/launch made a
 *   client navigation fail its RSC fetch on the cross-origin 303 and re-run
 *   the whole chain as a full navigation);
 * - the launch counter is recorded after the redirect has been sent, never on
 *   the user's path.
 *
 * The page below only ever renders the "not configured" state.
 */
export default async function MapPrepLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [, destination] = await Promise.all([requireProductAccess("/map-prep"), loadMapPrepDestination()]);
  if (destination) {
    after(() => recordAggregateSignal({ metricKey: "map-prep-launch", outcome: "success", source: "runtime" }));
    redirect(destination.destinationUrl);
  }
  return children;
}
