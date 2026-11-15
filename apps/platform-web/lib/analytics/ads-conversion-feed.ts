/**
 * The file Google Ads imports conversions from (offline conversions matched by
 * click identifier). Plain logic: rows in, CSV text out.
 *
 * Google Ads finds each conversion action by NAME, with the same spelling and
 * capitalisation, so the three names below are a contract with the account:
 * the owner creates conversion actions called exactly this. No conversion id or
 * label exists for this kind of conversion, and none is invented here.
 *
 * Every row carries only: the ad click identifier, the conversion name, when it
 * happened, what was actually paid (first payment only) and the ledger row's
 * random id as the order id. No name, email address, account id or page.
 */

/** The fixed user name of the feed credential; the password is MVH_ADS_FEED_PASSWORD. */
export const ADS_FEED_USERNAME = "mathnexa-ads-feed";

export const ADS_CONVERSION_NAMES = ["account_created", "trial_started", "subscription_started"] as const;
export type AdsConversionName = (typeof ADS_CONVERSION_NAMES)[number];

export type ReportableAdsConversion = Readonly<{
  conversionId: string;
  eventName: AdsConversionName;
  occurredAt: string;
  valueMinorUnits: number | null;
  currency: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
}>;

/**
 * "data-manager" (default): ISO 8601 times with an explicit UTC offset, for a
 * Google Ads Data Manager HTTPS connection, where the columns are mapped once.
 * "legacy": the older Uploads > Schedules template, with its
 * `Parameters:TimeZone` row and `yyyy-MM-dd HH:mm:ss` times.
 */
export type AdsConversionFeedLayout = "data-manager" | "legacy";

export const ADS_CONVERSION_FEED_COLUMNS = [
  "Google Click ID",
  "GBRAID",
  "WBRAID",
  "Conversion Name",
  "Conversion Time",
  "Conversion Value",
  "Conversion Currency",
  "Order ID",
  "Ad User Data",
  "Ad Personalization"
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[A-Za-z0-9_-]{10,512}$/;

function identifier(value: unknown): string | null {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : null;
}

/** Accepts one database row; anything that is not exactly reportable is dropped. */
export function parseReportableAdsConversion(row: unknown): ReportableAdsConversion | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const eventName = ADS_CONVERSION_NAMES.find((name) => name === record.event_name);
  const occurredAt = typeof record.occurred_at === "string" ? Date.parse(record.occurred_at) : Number.NaN;
  const gclid = identifier(record.gclid);
  const gbraid = identifier(record.gbraid);
  const wbraid = identifier(record.wbraid);
  if (!eventName || typeof record.conversion_id !== "string" || !UUID.test(record.conversion_id) ||
    !Number.isFinite(occurredAt) || (!gclid && !gbraid && !wbraid)) return null;
  const paid = eventName === "subscription_started";
  const valueMinorUnits = typeof record.value_minor_units === "number" && Number.isSafeInteger(record.value_minor_units)
    ? record.value_minor_units
    : null;
  // A first payment without a positive USD amount is not a purchase to report.
  if (paid && (valueMinorUnits === null || valueMinorUnits <= 0 || record.currency !== "usd")) return null;
  return {
    conversionId: record.conversion_id.toLowerCase(),
    eventName,
    occurredAt: new Date(occurredAt).toISOString(),
    valueMinorUnits: paid ? valueMinorUnits : null,
    currency: paid ? "USD" : null,
    gclid,
    gbraid,
    wbraid
  };
}

function conversionTime(occurredAt: string, layout: AdsConversionFeedLayout): string {
  const seconds = occurredAt.slice(0, 19);
  return layout === "legacy" ? seconds.replace("T", " ") : `${seconds}+00:00`;
}

function amount(valueMinorUnits: number | null): string {
  return valueMinorUnits === null ? "" : (valueMinorUnits / 100).toFixed(2);
}

/** Every value here is from a closed alphabet, so quoting is belt and braces. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

export function buildAdsConversionFeed(
  conversions: readonly ReportableAdsConversion[],
  layout: AdsConversionFeedLayout = "data-manager"
): string {
  const lines: string[] = [];
  if (layout === "legacy") lines.push("Parameters:TimeZone=+0000");
  lines.push(ADS_CONVERSION_FEED_COLUMNS.join(","));
  for (const conversion of conversions) {
    lines.push([
      conversion.gclid ?? "",
      conversion.gbraid ?? "",
      conversion.wbraid ?? "",
      conversion.eventName,
      conversionTime(conversion.occurredAt, layout),
      amount(conversion.valueMinorUnits),
      conversion.currency ?? "",
      conversion.conversionId,
      // Clicks are kept only for visitors whose consent allows ad measurement
      // (lib/analytics/ad-measurement.ts), and only to measure: these
      // conversions are not offered for ad personalisation.
      "Granted",
      "Denied"
    ].map(cell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
