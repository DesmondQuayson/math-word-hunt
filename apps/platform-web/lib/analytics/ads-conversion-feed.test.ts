// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ADS_CONVERSION_FEED_COLUMNS,
  ADS_CONVERSION_NAMES,
  buildAdsConversionFeed,
  parseReportableAdsConversion
} from "./ads-conversion-feed";

const GCLID = "Cj0KCQjw-TESTgclid_0123456789AbCdEf";
const row = (overrides: Record<string, unknown> = {}) => ({
  conversion_id: "5F0C5A2E-1111-4222-8333-444455556666",
  event_name: "subscription_started",
  occurred_at: "2026-11-15T14:03:09.123+00:00",
  value_minor_units: 599,
  currency: "usd",
  gclid: GCLID,
  gbraid: null,
  wbraid: null,
  ...overrides
});

describe("reportable conversion rows", () => {
  it("names exactly the three conversion actions the Google Ads account must have", () => {
    expect(ADS_CONVERSION_NAMES).toEqual(["account_created", "trial_started", "subscription_started"]);
  });

  it("accepts a first payment with what was actually paid, in USD", () => {
    expect(parseReportableAdsConversion(row())).toEqual({
      conversionId: "5f0c5a2e-1111-4222-8333-444455556666",
      eventName: "subscription_started",
      occurredAt: "2026-11-15T14:03:09.123Z",
      valueMinorUnits: 599,
      currency: "USD",
      gclid: GCLID,
      gbraid: null,
      wbraid: null
    });
  });

  it("never gives an account or a trial a value", () => {
    for (const event_name of ["account_created", "trial_started"]) {
      const parsed = parseReportableAdsConversion(row({ event_name, value_minor_units: 599, currency: "usd" }));
      expect(parsed?.valueMinorUnits).toBeNull();
      expect(parsed?.currency).toBeNull();
    }
  });

  it("drops anything that is not exactly reportable", () => {
    for (const bad of [null, "row", row({ event_name: "purchase" }), row({ conversion_id: "not-a-uuid" }), row({ occurred_at: "yesterday" }),
      row({ gclid: null }), row({ gclid: "bad value" }), row({ value_minor_units: 0 }), row({ value_minor_units: -599 }),
      row({ value_minor_units: null }), row({ value_minor_units: 5.99 }), row({ currency: "eur" }), row({ currency: null })]) {
      expect(parseReportableAdsConversion(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("keeps an iOS click that has gbraid or wbraid and no gclid", () => {
    expect(parseReportableAdsConversion(row({ event_name: "account_created", gclid: null, gbraid: "0AAAAAo_gbraid_value" }))?.gbraid).toBe("0AAAAAo_gbraid_value");
    expect(parseReportableAdsConversion(row({ event_name: "account_created", gclid: null, wbraid: "0AAAAAo_wbraid_value" }))?.wbraid).toBe("0AAAAAo_wbraid_value");
  });
});

describe("Google Ads conversion file", () => {
  const conversions = [
    parseReportableAdsConversion(row({ conversion_id: "11111111-1111-4111-8111-111111111111", event_name: "account_created", occurred_at: "2026-11-14T09:00:00Z" }))!,
    parseReportableAdsConversion(row({ conversion_id: "22222222-2222-4222-8222-222222222222", event_name: "trial_started", occurred_at: "2026-11-14T09:05:30Z" }))!,
    parseReportableAdsConversion(row({ conversion_id: "33333333-3333-4333-8333-333333333333" }))!
  ];

  it("writes one header and one row per conversion, with UTC offsets", () => {
    expect(buildAdsConversionFeed(conversions).split("\r\n")).toEqual([
      "Google Click ID,GBRAID,WBRAID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID,Ad User Data,Ad Personalization",
      `${GCLID},,,account_created,2026-11-14T09:00:00+00:00,,,11111111-1111-4111-8111-111111111111,Granted,Denied`,
      `${GCLID},,,trial_started,2026-11-14T09:05:30+00:00,,,22222222-2222-4222-8222-222222222222,Granted,Denied`,
      `${GCLID},,,subscription_started,2026-11-15T14:03:09+00:00,5.99,USD,33333333-3333-4333-8333-333333333333,Granted,Denied`,
      ""
    ]);
  });

  it("writes the legacy template with its time zone row", () => {
    const lines = buildAdsConversionFeed(conversions, "legacy").split("\r\n");
    expect(lines[0]).toBe("Parameters:TimeZone=+0000");
    expect(lines[1]).toBe(ADS_CONVERSION_FEED_COLUMNS.join(","));
    expect(lines[4]).toBe(`${GCLID},,,subscription_started,2026-11-15 14:03:09,5.99,USD,33333333-3333-4333-8333-333333333333,Granted,Denied`);
  });

  it("is a header alone when there is nothing to report", () => {
    expect(buildAdsConversionFeed([])).toBe(`${ADS_CONVERSION_FEED_COLUMNS.join(",")}\r\n`);
  });

  it("has no column that could carry a name, an email address or an account id", () => {
    const personal = ADS_CONVERSION_FEED_COLUMNS
      .filter((column) => column !== "Conversion Name" && /email|phone|name|account|address|\bip\b/i.test(column));
    expect(personal).toEqual([]);
    const text = buildAdsConversionFeed(conversions);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/cus_|sub_|in_[A-Za-z0-9]{6}|cs_/);
  });
});
