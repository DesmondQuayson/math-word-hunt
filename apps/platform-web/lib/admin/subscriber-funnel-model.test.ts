import { describe, expect, it } from "vitest";

import {
  centralDate,
  centralMidnight,
  computeSubscriberFunnel,
  hasRealPaymentEvidence,
  isReservedTestAddress,
  resolveFunnelPeriod,
  summarizeSubscriberFunnel,
  type FunnelInput,
  type FunnelInvoice,
  type SubscriberFunnelSnapshot
} from "./subscriber-funnel-model";

const NOW = new Date("2026-11-22T18:00:00.000Z"); // 12:00 noon in Chicago (CST, UTC-6)

const metric = (snapshot: SubscriberFunnelSnapshot, key: string) =>
  [...snapshot.acquisition, ...snapshot.trials, ...snapshot.payments, ...snapshot.current, ...snapshot.sources].find((entry) => entry.key === key)?.value;

const base = (overrides: Partial<FunnelInput> = {}): FunnelInput => ({
  accounts: [], adminIds: new Set(), testIds: new Set(), subscriptions: [], acceptances: [], stripePagesOpened: [], conversions: [],
  refundRequests: [], invoices: [], invoiceNote: null, refunds: [], conversionLogStartedAt: "2026-11-15T07:00:00.000Z", webAnalytics: "not-enabled",
  adClickAccounts: new Set(), ...overrides
});

describe("US Central periods", () => {
  it("finds midnight in Chicago across daylight saving time", () => {
    expect(centralMidnight("2026-11-22").toISOString()).toBe("2026-11-22T06:00:00.000Z");
    expect(centralMidnight("2026-07-04").toISOString()).toBe("2026-07-04T05:00:00.000Z");
    expect(centralMidnight("2026-11-01").toISOString()).toBe("2026-11-01T05:00:00.000Z"); // DST ends at 02:00 that day
    expect(centralMidnight("2026-03-08").toISOString()).toBe("2026-03-08T06:00:00.000Z"); // DST starts at 02:00 that day
    expect(centralDate(new Date("2026-11-22T05:59:59.000Z"))).toBe("2026-11-21");
  });

  it("resolves every named period", () => {
    const today = resolveFunnelPeriod({ period: "today" }, NOW);
    expect([today.startIso, today.endIso, today.fromDate, today.toDate]).toEqual(["2026-11-22T06:00:00.000Z", NOW.toISOString(), "2026-11-22", "2026-11-22"]);
    const yesterday = resolveFunnelPeriod({ period: "yesterday" }, NOW);
    expect([yesterday.startIso, yesterday.endIso, yesterday.fromDate]).toEqual(["2026-11-21T06:00:00.000Z", "2026-11-22T06:00:00.000Z", "2026-11-21"]);
    expect(resolveFunnelPeriod({ period: "7d" }, NOW).fromDate).toBe("2026-11-16");
    expect(resolveFunnelPeriod({ period: "30d" }, NOW).fromDate).toBe("2026-10-24");
    expect(resolveFunnelPeriod({}, NOW).key).toBe("30d");
    const month = resolveFunnelPeriod({ period: "month" }, NOW);
    expect([month.fromDate, month.startIso]).toEqual(["2026-11-01", "2026-11-01T05:00:00.000Z"]);
    const lifetime = resolveFunnelPeriod({ period: "lifetime" }, NOW);
    expect([lifetime.startIso, lifetime.fromDate]).toEqual([null, null]);
  });

  it("uses a valid custom range and falls back to 30 days for a bad one", () => {
    const custom = resolveFunnelPeriod({ period: "custom", from: "2026-11-01", to: "2026-11-15" }, NOW);
    expect([custom.key, custom.startIso, custom.endIso, custom.fallback]).toEqual(["custom", "2026-11-01T05:00:00.000Z", "2026-11-16T06:00:00.000Z", false]);
    expect(resolveFunnelPeriod({ period: "custom", from: "2026-11-01", to: "2026-11-22" }, NOW).endIso).toBe(NOW.toISOString());
    for (const [from, to] of [["2026-11-15", "2026-11-01"], ["2026-11-01", "2026-11-23"], ["2026-02-30", "2026-03-01"], ["", ""], ["2026-11-01<", "2026-11-02"]]) {
      const fallback = resolveFunnelPeriod({ period: "custom", from, to }, NOW);
      expect([fallback.key, fallback.fallback]).toEqual(["30d", true]);
    }
    expect(resolveFunnelPeriod({ period: "forever" }, NOW).key).toBe("30d");
  });
});

describe("account segments", () => {
  it("recognises only reserved test names", () => {
    for (const address of ["a@example.test", "b@example.invalid", "c@EXAMPLE.COM", "d@sub.example.org", "e@example.net", "f@foo.localhost", "g@x.example"]) expect(isReservedTestAddress(address)).toBe(true);
    for (const address of ["teacher@gmail.com", "parent@yahoo.com", "x@examples.com", "y@testing.com", "z@mytest.com", "", null, "no-at-sign.test"]) expect(isReservedTestAddress(address)).toBe(false);
  });

  it("leaves the Super Admin and test accounts out of every count", () => {
    const accounts = ["admin", "test", "customer"].map((id) => ({ id, createdAt: "2026-11-20T15:00:00.000Z", emailConfirmedAt: "2026-11-20T15:05:00.000Z", trialRedeemedAt: "2026-11-20T16:00:00.000Z" }));
    const snapshot = computeSubscriberFunnel(base({
      accounts, adminIds: new Set(["admin"]), testIds: new Set(["test"]),
      subscriptions: accounts.map((account) => ({ ownerId: account.id, status: "trialing", trialEnd: "2026-11-23T16:00:00.000Z", firstPaidAt: null, lastPaidAt: null, canceledAt: null, createdAt: "2026-11-20T16:00:00.000Z" }))
    }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect(snapshot.segments).toEqual({ genuine: 1, owner: 1, test: 1, schoolCode: null });
    expect([metric(snapshot, "registrations"), metric(snapshot, "verified"), metric(snapshot, "trial-activations"), metric(snapshot, "active-trials")]).toEqual([1, 1, 1, 1]);
  });

  it("says so when test addresses could not be checked", () => {
    const snapshot = computeSubscriberFunnel(base({ testIds: null }), resolveFunnelPeriod({}, NOW), "live", NOW);
    expect(snapshot.segments.test).toBeNull();
    expect(snapshot.notes.join(" ")).toMatch(/test accounts are counted with customers/);
  });
});

describe("payments from Stripe invoices", () => {
  const invoice = (overrides: Partial<FunnelInvoice>): FunnelInvoice => ({
    ownerId: "a", subscriptionId: "sub_a", createdAt: "2026-11-18T16:00:00.000Z", paidAt: "2026-11-18T16:00:05.000Z", status: "paid",
    amountDueMinorUnits: 599, amountPaidMinorUnits: 599, attemptCount: 1, ...overrides
  });
  const accounts = ["a", "b", "c"].map((id) => ({ id, createdAt: "2026-10-01T15:00:00.000Z", emailConfirmedAt: "2026-10-01T15:05:00.000Z", trialRedeemedAt: "2026-11-17T16:00:00.000Z" }));

  it("never counts the trial's $0 invoice as a payment", () => {
    const snapshot = computeSubscriberFunnel(base({ accounts, invoices: [invoice({ amountDueMinorUnits: 0, amountPaidMinorUnits: 0, createdAt: "2026-11-17T16:00:00.000Z" })] }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect([metric(snapshot, "first-payments"), metric(snapshot, "revenue")]).toEqual([0, 0]);
    expect(metric(snapshot, "trials-expired")).toBe(3);
  });

  it("separates first payments, declines and recoveries, renewals and revenue", () => {
    const snapshot = computeSubscriberFunnel(base({
      accounts,
      invoices: [
        invoice({ ownerId: "a" }), // first charge paid at once
        invoice({ ownerId: "a", createdAt: "2026-11-21T16:00:00.000Z", paidAt: "2026-11-21T16:00:04.000Z" }), // a later monthly charge
        invoice({ ownerId: "b", subscriptionId: "sub_b", attemptCount: 3, paidAt: "2026-11-20T16:00:00.000Z" }), // first charge declined, then paid
        invoice({ ownerId: "c", subscriptionId: "sub_c", status: "open", paidAt: null, amountPaidMinorUnits: 0, attemptCount: 2 }), // first charge still declined
        invoice({ ownerId: "a", subscriptionId: "sub_old", createdAt: "2026-09-01T16:00:00.000Z", paidAt: "2026-09-01T16:00:03.000Z" }) // before the period
      ]
    }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect(metric(snapshot, "first-payments")).toBe(1); // b; a's first payment was in September
    expect(metric(snapshot, "failed-first")).toBe(2); // b and c
    expect(metric(snapshot, "recovered-first")).toBe(1); // b
    expect([metric(snapshot, "failed-renewals"), metric(snapshot, "recovered-renewals")]).toEqual([0, 0]);
    expect(metric(snapshot, "successful-renewals")).toBe(1); // a's later monthly charge
    expect(metric(snapshot, "revenue")).toBe(599 * 3); // a's first + renewal in the period, b
    expect([metric(snapshot, "refunds"), metric(snapshot, "net-revenue")]).toEqual([0, 599 * 3]);
    expect(metric(snapshot, "trials-expired")).toBe(1); // c never paid
  });

  it("subtracts refunds Stripe completed for customers in the period, and only those", () => {
    const snapshot = computeSubscriberFunnel(base({
      accounts: [...accounts, { id: "owner", createdAt: "2026-10-01T15:00:00.000Z", emailConfirmedAt: null, trialRedeemedAt: null }],
      adminIds: new Set(["owner"]),
      invoices: [invoice({ ownerId: "a" })],
      refunds: [
        { ownerId: "a", createdAt: "2026-11-19T16:00:00.000Z", amountMinorUnits: 599 },
        { ownerId: "a", createdAt: "2026-09-02T16:00:00.000Z", amountMinorUnits: 599 }, // before the period
        { ownerId: "owner", createdAt: "2026-11-19T16:00:00.000Z", amountMinorUnits: 599 }, // the owner's own account
        { ownerId: "stranger", createdAt: "2026-11-19T16:00:00.000Z", amountMinorUnits: 599 } // not a MathNexa account
      ]
    }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect([metric(snapshot, "revenue"), metric(snapshot, "refunds"), metric(snapshot, "net-revenue")]).toEqual([599, 599, 0]);
    expect(snapshot.payments.find((entry) => entry.key === "refunds")?.detail).toBe("1 refund Stripe completed");
  });

  it("shows refunds and net revenue as not recorded when Stripe refunds cannot be read", () => {
    const snapshot = computeSubscriberFunnel(base({ accounts, invoices: [invoice({ ownerId: "a" })], refunds: null }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect([metric(snapshot, "revenue"), metric(snapshot, "refunds"), metric(snapshot, "net-revenue")]).toEqual([599, null, null]);
    expect(snapshot.payments.find((entry) => entry.key === "refunds")?.detail).toMatch(/not available/);
  });

  it("counts a declined and recovered monthly charge as a renewal", () => {
    const snapshot = computeSubscriberFunnel(base({
      accounts,
      invoices: [
        invoice({ ownerId: "a", createdAt: "2026-10-18T16:00:00.000Z", paidAt: "2026-10-18T16:00:05.000Z" }),
        invoice({ ownerId: "a", createdAt: "2026-11-18T16:00:00.000Z", paidAt: "2026-11-19T16:00:00.000Z", attemptCount: 2 })
      ]
    }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect([metric(snapshot, "failed-renewals"), metric(snapshot, "recovered-renewals"), metric(snapshot, "failed-first")]).toEqual([1, 1, 0]);
    expect(metric(snapshot, "successful-renewals")).toBe(1);
  });
});

describe("at a glance summary", () => {
  const accounts = [
    ["today", "2026-11-22T15:00:00.000Z"], ["week", "2026-11-18T15:00:00.000Z"], ["month", "2026-11-05T15:00:00.000Z"], ["older", "2026-10-01T15:00:00.000Z"]
  ].map(([id, createdAt]) => ({ id: id as string, createdAt: createdAt as string, emailConfirmedAt: null, trialRedeemedAt: null }));

  it("puts today, the last 7 days, this month and lifetime side by side with the period view's rules", () => {
    const input = base({ accounts, invoices: null, conversions: [{ ownerId: "week", eventName: "subscription_started", at: "2026-11-20T16:00:00.000Z" }] });
    const summary = summarizeSubscriberFunnel(input, "live", NOW);
    expect(summary.periods.map((period) => period.label)).toEqual(["Today", "Last 7 days", "This month", "Lifetime"]);
    const row = (key: string) => summary.rows.find((entry) => entry.key === key);
    expect(row("registrations")?.values).toEqual([1, 2, 3, 4]);
    // First payments come from the conversion log only inside its coverage (from 15 Nov); this month starts earlier.
    expect(row("first-payments")?.values).toEqual([0, 1, null, 1]);
    expect(row("revenue")).toMatchObject({ format: "usd", values: [null, null, null, null] });
    expect(row("canceled")?.label).toBe("Subscriptions canceled");
    expect(summary.rows.map((entry) => entry.key)).toEqual(["registrations", "verified", "trial-activations", "first-payments", "failed-first", "successful-renewals", "revenue", "refunds", "net-revenue", "canceled"]);
    const week = computeSubscriberFunnel(input, resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect(row("registrations")?.values[1]).toBe(metric(week, "registrations"));
  });

  it("is left out of a single-period snapshot", () => {
    expect(computeSubscriberFunnel(base(), resolveFunnelPeriod({}, NOW), "live", NOW).summary).toBeNull();
  });
});

describe("when Stripe cannot be read", () => {
  const accounts = [{ id: "a", createdAt: "2026-10-01T15:00:00.000Z", emailConfirmedAt: "2026-10-01T15:05:00.000Z", trialRedeemedAt: "2026-10-02T16:00:00.000Z" }];
  const legacy = { ownerId: "a", status: "active", trialEnd: "2026-10-03T16:00:00.000Z", firstPaidAt: "2026-10-02T16:00:01.000Z", lastPaidAt: "2026-11-03T16:00:02.000Z", canceledAt: null, createdAt: "2026-10-02T16:00:00.000Z" };

  it("uses the conversion log inside its coverage, and says not recorded before it", () => {
    const input = base({ accounts, subscriptions: [legacy], invoices: null, invoiceNote: "Stripe could not be read just now.", conversions: [{ ownerId: "a", eventName: "subscription_started", at: "2026-11-18T16:00:00.000Z" }] });
    const week = computeSubscriberFunnel(input, resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect(metric(week, "first-payments")).toBe(1);
    expect([metric(week, "failed-first"), metric(week, "revenue")]).toEqual([null, null]);
    expect(week.notes).toContain("Stripe could not be read just now.");
    const month = computeSubscriberFunnel(input, resolveFunnelPeriod({ period: "30d" }, NOW), "live", NOW);
    expect(metric(month, "first-payments")).toBeNull();
    const lifetime = computeSubscriberFunnel(input, resolveFunnelPeriod({ period: "lifetime" }, NOW), "live", NOW);
    expect(metric(lifetime, "first-payments")).toBe(1);
  });

  it("reads real payments from subscription records, never the trial's $0 invoice", () => {
    expect(hasRealPaymentEvidence(legacy)).toBe(true);
    expect(hasRealPaymentEvidence({ ...legacy, lastPaidAt: legacy.firstPaidAt })).toBe(false); // only the $0 trial invoice
    expect(hasRealPaymentEvidence({ ...legacy, trialEnd: null })).toBe(true); // no trial: every payment is real
    expect(hasRealPaymentEvidence({ ...legacy, trialEnd: null, firstPaidAt: null })).toBe(false);
  });
});

describe("sources", () => {
  it("splits accounts, trials and first payments that came from a Google Ads click", () => {
    const accounts = ["ad", "other"].map((id) => ({ id, createdAt: "2026-11-18T15:00:00.000Z", emailConfirmedAt: null, trialRedeemedAt: "2026-11-18T16:00:00.000Z" }));
    const invoices: FunnelInvoice[] = accounts.map((account) => ({
      ownerId: account.id, subscriptionId: `sub_${account.id}`, createdAt: "2026-11-19T16:00:00.000Z", paidAt: "2026-11-19T16:00:04.000Z",
      status: "paid", amountDueMinorUnits: 599, amountPaidMinorUnits: 599, attemptCount: 1
    }));
    const snapshot = computeSubscriberFunnel(base({ accounts, invoices, adClickAccounts: new Set(["ad"]) }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect([metric(snapshot, "ads-accounts"), metric(snapshot, "ads-trials"), metric(snapshot, "ads-first-payments"), metric(snapshot, "other-sources")]).toEqual([1, 1, 1, null]);
    const unreadable = computeSubscriberFunnel(base({ accounts, adClickAccounts: null }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect(metric(unreadable, "ads-accounts")).toBeNull();
  });
});

describe("trials, rates and notes", () => {
  it("counts trials that ended without paying, and those canceled during the trial", () => {
    const accounts = ["a", "b"].map((id) => ({ id, createdAt: "2026-11-19T15:00:00.000Z", emailConfirmedAt: "2026-11-19T15:05:00.000Z", trialRedeemedAt: "2026-11-19T16:00:00.000Z" }));
    const snapshot = computeSubscriberFunnel(base({
      accounts,
      subscriptions: [
        { ownerId: "a", status: "canceled", trialEnd: "2026-11-20T16:00:00.000Z", firstPaidAt: null, lastPaidAt: null, canceledAt: "2026-11-19T20:00:00.000Z", createdAt: "2026-11-19T16:00:00.000Z" },
        { ownerId: "b", status: "past_due", trialEnd: "2026-11-20T16:00:00.000Z", firstPaidAt: null, lastPaidAt: null, canceledAt: null, createdAt: "2026-11-19T16:00:00.000Z" }
      ]
    }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect([metric(snapshot, "trials-ended"), metric(snapshot, "trials-expired"), metric(snapshot, "past-due")]).toEqual([2, 2, 1]);
    expect(snapshot.trials.find((entry) => entry.key === "trials-expired")?.detail).toBe("1 canceled before the trial ended");
    expect(snapshot.rates.find((rate) => rate.key === "trial-to-paid")).toMatchObject({ numerator: 0, denominator: 2, percent: 0 });
  });

  it("shows no rate rather than zero when nothing can be compared", () => {
    const snapshot = computeSubscriberFunnel(base(), resolveFunnelPeriod({ period: "today" }, NOW), "live", NOW);
    expect(snapshot.rates.every((rate) => rate.percent === null && rate.denominator === 0)).toBe(true);
    expect([metric(snapshot, "visitors"), metric(snapshot, "registration-attempts"), metric(snapshot, "pricing-visits")]).toEqual([null, null, null]);
    expect(snapshot.notes.join(" ")).toMatch(/not enabled, so they were never recorded/);
    expect(snapshot.notes.join(" ")).toMatch(/school-code users are not counted/);
  });

  it("counts returning subscribers and checkout steps once per account", () => {
    const accounts = [{ id: "a", createdAt: "2026-09-01T15:00:00.000Z", emailConfirmedAt: "2026-09-01T15:05:00.000Z", trialRedeemedAt: "2026-09-01T16:00:00.000Z" }];
    const snapshot = computeSubscriberFunnel(base({
      accounts,
      subscriptions: [
        { ownerId: "a", status: "canceled", trialEnd: "2026-09-02T16:00:00.000Z", firstPaidAt: null, lastPaidAt: "2026-09-02T16:00:05.000Z", canceledAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-09-01T16:00:00.000Z" },
        { ownerId: "a", status: "active", trialEnd: null, firstPaidAt: "2026-11-20T16:00:05.000Z", lastPaidAt: "2026-11-20T16:00:05.000Z", canceledAt: null, createdAt: "2026-11-20T16:00:00.000Z" }
      ],
      acceptances: [{ ownerId: "a", at: "2026-11-20T15:58:00.000Z" }, { ownerId: "a", at: "2026-11-20T15:59:00.000Z" }],
      stripePagesOpened: [{ ownerId: "a", at: "2026-11-20T15:59:30.000Z" }]
    }), resolveFunnelPeriod({ period: "7d" }, NOW), "live", NOW);
    expect([metric(snapshot, "returning"), metric(snapshot, "checkout-attempts"), metric(snapshot, "stripe-pages"), metric(snapshot, "active-paid")]).toEqual([1, 1, 1, 1]);
  });
});
