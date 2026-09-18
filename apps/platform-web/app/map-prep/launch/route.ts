import { NextResponse, after } from "next/server";

import { recordAggregateSignal } from "@/lib/operations/server";
import { loadMapPrepDestination } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";

/**
 * Direct-hit launch route (bookmarks, the hosted contract, older links). The
 * homepage click no longer passes through here: `/map-prep` now redirects an
 * entitled visitor straight to the approved destination, because a client-side
 * navigation cannot follow a Route Handler's cross-origin 303 (the RSC fetch
 * fails and the browser re-requests this route as a full navigation, running
 * the access check, the CMS lookup and the analytics write a second time).
 *
 * Speed V2: the entitlement decision and the (cached) destination lookup run
 * in parallel; the launch counter is recorded after the redirect is sent.
 */
export async function GET(request: Request) {
  const [, destination] = await Promise.all([requireProductAccess("/map-prep"), loadMapPrepDestination()]);
  if (!destination) return NextResponse.redirect(new URL("/map-prep", request.url), 303);
  after(() => recordAggregateSignal({ metricKey: "map-prep-launch", outcome: "success", source: "runtime" }));
  return NextResponse.redirect(destination.destinationUrl, 303);
}
