import { NextResponse } from "next/server";

import { recordAggregateSignal } from "@/lib/operations/server";
import { loadMapPrepDestination } from "@/lib/resources/catalog";

export async function GET(request: Request) {
  const destination = await loadMapPrepDestination();
  if (!destination) return NextResponse.redirect(new URL("/map-prep", request.url), 303);
  await recordAggregateSignal({ metricKey: "map-prep-launch", outcome: "success", source: "runtime" });
  return NextResponse.redirect(destination, 303);
}
