import { timingSafeEqual } from "node:crypto";

import {
  ADS_FEED_USERNAME,
  buildAdsConversionFeed,
  parseReportableAdsConversion,
  type AdsConversionFeedLayout,
  type ReportableAdsConversion
} from "@/lib/analytics/ads-conversion-feed";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const MINIMUM_PASSWORD_LENGTH = 24;
const DEFAULT_DAYS = 30;
const MAXIMUM_DAYS = 90;

function feedPassword(): string | null {
  const password = process.env.MVH_ADS_FEED_PASSWORD?.trim() ?? "";
  return password.length >= MINIMUM_PASSWORD_LENGTH ? password : null;
}

function same(expected: string, presented: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(presented);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** HTTP Basic (what Google Ads sends for an HTTPS source) or a Bearer token. */
function authorized(request: Request, password: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) return same(password, header.slice("Bearer ".length));
  if (!header.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  // Both halves are always compared, so a wrong username costs the same time.
  const user = same(ADS_FEED_USERNAME, decoded.slice(0, separator));
  const secret = same(password, decoded.slice(separator + 1));
  return user && secret;
}

/**
 * The conversions Google Ads imports, as a CSV file it fetches on a schedule.
 *
 * Fails closed: 404 until `MVH_ADS_FEED_PASSWORD` is configured, 401 without
 * that credential. Each response covers the last `days` (default 30, at most
 * 90), so a missed day, or a conversion Google Ads refused because its click
 * was under six hours old, is simply offered again. Google Ads counts a click,
 * name and time once however often it is offered.
 */
export async function GET(request: Request) {
  if (!isProductionPlatformMode()) return Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
  const password = feedPassword();
  if (!password) return Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
  if (!authorized(request, password)) {
    return Response.json({ error: "unauthorized" }, {
      status: 401,
      headers: { ...NO_STORE, "WWW-Authenticate": "Basic realm=\"MathNexa ads conversions\", charset=\"UTF-8\"" }
    });
  }
  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Number.isSafeInteger(requestedDays) && requestedDays >= 1 && requestedDays <= MAXIMUM_DAYS ? requestedDays : DEFAULT_DAYS;
  const layout: AdsConversionFeedLayout = url.searchParams.get("layout") === "legacy" ? "legacy" : "data-manager";
  const client = createServiceSupabaseClient();
  if (!client) return Response.json({ state: "database-unavailable" }, { status: 503, headers: NO_STORE });
  const { data, error } = await client.rpc("list_reportable_ads_conversions", {
    p_since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    p_stripe_environment: tryGetConsumerBillingConfiguration()?.stripeMode ?? null
  });
  if (error || !Array.isArray(data)) return Response.json({ state: "database-unavailable" }, { status: 503, headers: NO_STORE });
  const conversions = data
    .map(parseReportableAdsConversion)
    .filter((conversion): conversion is ReportableAdsConversion => conversion !== null);
  return new Response(buildAdsConversionFeed(conversions, layout), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "inline; filename=\"google-ads-conversions.csv\"",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
