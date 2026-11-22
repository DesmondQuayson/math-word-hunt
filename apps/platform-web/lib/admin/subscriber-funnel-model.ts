/**
 * Subscriber funnel for the Super Admin: pure period and counting rules, kept
 * apart from the database and Stripe reads (subscriber-funnel.ts) so they can
 * be tested. Every count is an aggregate. A value of `null` means the record
 * does not exist or could not be read; it is never shown as zero.
 */

export const FUNNEL_TIME_ZONE = "America/Chicago";

export const FUNNEL_PERIODS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["month", "This month"],
  ["lifetime", "Lifetime"],
  ["custom", "Custom range"]
] as const;

export type FunnelPeriodKey = (typeof FUNNEL_PERIODS)[number][0];

export type FunnelPeriod = Readonly<{
  key: FunnelPeriodKey;
  label: string;
  /** Inclusive start (UTC ISO), or null for lifetime. */
  startIso: string | null;
  /** Exclusive end (UTC ISO). */
  endIso: string;
  /** Calendar dates in US Central time, for display and the custom-range inputs. */
  fromDate: string | null;
  toDate: string;
  /** True when a custom range was invalid and the default period was used instead. */
  fallback: boolean;
}>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_CUSTOM_DAYS = 3_660;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUNNEL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
});

function localParts(instant: Date): { date: string; hour: string } {
  const parts = Object.fromEntries(partsFormatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour === "24" ? "00" : String(parts.hour) };
}

/** The calendar date in US Central time of an instant. */
export function centralDate(instant: Date): string {
  return localParts(instant).date;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** The UTC instant of midnight in US Central time on a calendar date (CST is UTC-6, CDT is UTC-5). */
export function centralMidnight(date: string): Date {
  for (const offsetHours of [5, 6, 4, 7]) {
    const candidate = new Date(`${date}T0${offsetHours}:00:00.000Z`);
    const local = localParts(candidate);
    if (local.date === date && local.hour === "00") return candidate;
  }
  throw new Error("central-midnight-unresolved");
}

export function resolveFunnelPeriod(input: Readonly<{ period?: unknown; from?: unknown; to?: unknown }>, now = new Date()): FunnelPeriod {
  const today = centralDate(now);
  const nowIso = now.toISOString();
  const label = (key: FunnelPeriodKey) => FUNNEL_PERIODS.find(([candidate]) => candidate === key)?.[1] ?? key;
  const rolling = (key: FunnelPeriodKey, from: string, fallback = false): FunnelPeriod => Object.freeze({
    key, label: label(key), startIso: centralMidnight(from).toISOString(), endIso: nowIso, fromDate: from, toDate: today, fallback
  });
  const key = FUNNEL_PERIODS.some(([candidate]) => candidate === input.period) ? input.period as FunnelPeriodKey : "30d";
  switch (key) {
    case "today": return rolling("today", today);
    case "yesterday": {
      const yesterday = shiftDate(today, -1);
      return Object.freeze({ key, label: label(key), startIso: centralMidnight(yesterday).toISOString(), endIso: centralMidnight(today).toISOString(), fromDate: yesterday, toDate: yesterday, fallback: false });
    }
    case "7d": return rolling("7d", shiftDate(today, -6));
    case "month": return rolling("month", `${today.slice(0, 8)}01`);
    case "lifetime": return Object.freeze({ key, label: label(key), startIso: null, endIso: nowIso, fromDate: null, toDate: today, fallback: false });
    case "custom": {
      const { from, to } = input;
      if (validDate(from) && validDate(to) && from <= to && to <= today &&
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS <= MAX_CUSTOM_DAYS) {
        const end = to === today ? nowIso : centralMidnight(shiftDate(to, 1)).toISOString();
        return Object.freeze({ key, label: label(key), startIso: centralMidnight(from).toISOString(), endIso: end, fromDate: from, toDate: to, fallback: false });
      }
      return rolling("30d", shiftDate(today, -29), true);
    }
    default: return rolling("30d", shiftDate(today, -29));
  }
}

/** Addresses under names reserved for testing and documentation (RFC 2606, RFC 6761) can never belong to a customer. */
export function isReservedTestAddress(address: unknown): boolean {
  if (typeof address !== "string") return false;
  const domain = address.trim().toLowerCase().split("@").at(-1) ?? "";
  if (!domain || !address.includes("@")) return false;
  return ["example.com", "example.net", "example.org", "test", "invalid", "example", "localhost"]
    .some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`));
}

export type FunnelAccount = Readonly<{ id: string; createdAt: string; emailConfirmedAt: string | null; trialRedeemedAt: string | null }>;
export type FunnelSubscription = Readonly<{
  ownerId: string; status: string; trialEnd: string | null; firstPaidAt: string | null; lastPaidAt: string | null;
  canceledAt: string | null; createdAt: string;
}>;
export type FunnelInvoice = Readonly<{
  ownerId: string; subscriptionId: string | null; createdAt: string; paidAt: string | null; status: string | null;
  amountDueMinorUnits: number; amountPaidMinorUnits: number; attemptCount: number;
}>;
export type FunnelTimestamped = Readonly<{ ownerId: string; at: string }>;
export type FunnelConversion = Readonly<{ ownerId: string; eventName: string; at: string }>;

export type FunnelInput = Readonly<{
  accounts: readonly FunnelAccount[];
  adminIds: ReadonlySet<string>;
  /** Accounts whose sign-in address is under a reserved test name; null when the addresses could not be checked. */
  testIds: ReadonlySet<string> | null;
  subscriptions: readonly FunnelSubscription[];
  acceptances: readonly FunnelTimestamped[];
  stripePagesOpened: readonly FunnelTimestamped[];
  conversions: readonly FunnelConversion[];
  refundRequests: readonly FunnelTimestamped[];
  /** Stripe invoices for known customers, or null when Stripe could not be read. */
  invoices: readonly FunnelInvoice[] | null;
  invoiceNote: string | null;
  /** When the server conversion log began (first payments are recorded there from then on). */
  conversionLogStartedAt: string | null;
  webAnalytics: "not-enabled" | "enabled";
  /** Accounts that arrived from a Google Ads click (kept at sign-up or checkout); null when unreadable. */
  adClickAccounts: ReadonlySet<string> | null;
}>;

export type FunnelMetric = Readonly<{ key: string; label: string; value: number | null; detail: string; format?: "count" | "usd" }>;
export type FunnelRate = Readonly<{ key: string; label: string; numerator: number; denominator: number; percent: number | null }>;

export type SubscriberFunnelSnapshot = Readonly<{
  state: "ready" | "partial" | "unavailable";
  period: FunnelPeriod;
  environment: "live" | "test";
  segments: Readonly<{ genuine: number; owner: number; test: number | null; schoolCode: null }>;
  acquisition: readonly FunnelMetric[];
  trials: readonly FunnelMetric[];
  payments: readonly FunnelMetric[];
  current: readonly FunnelMetric[];
  sources: readonly FunnelMetric[];
  rates: readonly FunnelRate[];
  notes: readonly string[];
}>;

const TRIAL_MS = DAY_MS;
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NaN);

/**
 * True when a subscription record proves a payment above zero. Any payment
 * after the trial ended is a real charge (the trial's $0 invoice is paid when
 * the trial starts). A subscription without a trial records only real charges.
 */
export function hasRealPaymentEvidence(subscription: FunnelSubscription): boolean {
  if (subscription.trialEnd === null) return subscription.firstPaidAt !== null;
  return subscription.lastPaidAt !== null && time(subscription.lastPaidAt) >= time(subscription.trialEnd);
}

function failedAttempt(invoice: FunnelInvoice): boolean {
  return invoice.status === "paid" ? invoice.attemptCount > 1 : invoice.attemptCount >= 1 && (invoice.status === "open" || invoice.status === "uncollectible");
}

export function computeSubscriberFunnel(input: FunnelInput, period: FunnelPeriod, environment: "live" | "test", now = new Date(), readFailures = 0): SubscriberFunnelSnapshot {
  const start = period.startIso ? time(period.startIso) : Number.NEGATIVE_INFINITY;
  const end = time(period.endIso);
  const inPeriod = (iso: string | null | undefined) => { const value = time(iso); return Number.isFinite(value) && value >= start && value < end; };
  const nowMs = now.getTime();

  const owner = new Set(input.accounts.filter((account) => input.adminIds.has(account.id)).map((account) => account.id));
  const test = new Set(input.accounts.filter((account) => !owner.has(account.id) && input.testIds?.has(account.id)).map((account) => account.id));
  const genuine = (id: string) => !owner.has(id) && !test.has(id);
  const accounts = input.accounts.filter((account) => genuine(account.id));
  const accountIds = new Set(accounts.map((account) => account.id));
  const known = (id: string) => accountIds.has(id);
  const subscriptions = input.subscriptions.filter((row) => known(row.ownerId));
  const invoices = input.invoices?.filter((row) => known(row.ownerId) && row.amountDueMinorUnits > 0) ?? null;

  // First real (above $0) invoice of each subscription, then each account's first real payment.
  const bySubscription = new Map<string, FunnelInvoice[]>();
  for (const invoice of invoices ?? []) {
    const key = invoice.subscriptionId ?? `owner:${invoice.ownerId}`;
    bySubscription.set(key, [...(bySubscription.get(key) ?? []), invoice]);
  }
  const firstInvoices = new Set<FunnelInvoice>();
  for (const list of bySubscription.values()) {
    const first = [...list].sort((a, b) => time(a.createdAt) - time(b.createdAt))[0];
    if (first) firstInvoices.add(first);
  }
  const firstPaymentAt = new Map<string, number>();
  for (const invoice of invoices ?? []) {
    if (invoice.status !== "paid" || invoice.amountPaidMinorUnits <= 0 || !invoice.paidAt) continue;
    const paid = time(invoice.paidAt);
    const current = firstPaymentAt.get(invoice.ownerId);
    if (current === undefined || paid < current) firstPaymentAt.set(invoice.ownerId, paid);
  }
  const conversionFirstPayment = new Map<string, number>();
  for (const event of input.conversions) {
    if (event.eventName !== "subscription_started" || !known(event.ownerId)) continue;
    const at = time(event.at);
    const current = conversionFirstPayment.get(event.ownerId);
    if (Number.isFinite(at) && (current === undefined || at < current)) conversionFirstPayment.set(event.ownerId, at);
  }
  const evidencePaid = new Set(subscriptions.filter(hasRealPaymentEvidence).map((row) => row.ownerId));
  const everPaid = (id: string) => invoices ? firstPaymentAt.has(id) : evidencePaid.has(id) || conversionFirstPayment.has(id);

  const notes: string[] = [];
  const logStart = input.conversionLogStartedAt ? time(input.conversionLogStartedAt) : Number.NaN;
  const idsPaidIn = (firstPayments: ReadonlyMap<string, number>) =>
    new Set([...firstPayments.entries()].filter(([, at]) => at >= start && at < end).map(([id]) => id));
  let firstPaymentIds: ReadonlySet<string> | null;
  let firstPaymentDetail: string;
  if (invoices) {
    firstPaymentIds = idsPaidIn(firstPaymentAt);
    firstPaymentDetail = "Accounts whose first charge above $0 was paid in this period (Stripe invoices)";
  } else if (Number.isFinite(logStart) && start >= logStart) {
    firstPaymentIds = idsPaidIn(conversionFirstPayment);
    firstPaymentDetail = "First charges above $0 in this period, from the server conversion log";
  } else if (period.key === "lifetime") {
    firstPaymentIds = new Set(accounts.filter((account) => everPaid(account.id)).map((account) => account.id));
    firstPaymentDetail = "Accounts with a real payment on record (dates before the conversion log are not recorded)";
  } else {
    firstPaymentIds = null;
    firstPaymentDetail = "Not recorded for this period: Stripe could not be read and the server conversion log starts later";
  }
  const genuineFirstPayments = firstPaymentIds?.size ?? null;

  const trialEnds = accounts
    .filter((account) => account.trialRedeemedAt)
    .map((account) => ({ id: account.id, endsAt: time(account.trialRedeemedAt) + TRIAL_MS }));
  const endedInPeriod = trialEnds.filter((trial) => trial.endsAt >= start && trial.endsAt < end && trial.endsAt <= nowMs);
  const endedWithoutPayment = endedInPeriod.filter((trial) => !everPaid(trial.id));
  const canceledDuringTrial = endedWithoutPayment.filter((trial) =>
    subscriptions.some((row) => row.ownerId === trial.id && row.canceledAt !== null && time(row.canceledAt) <= trial.endsAt)).length;

  const countInvoices = (predicate: (invoice: FunnelInvoice) => boolean) => invoices ? invoices.filter(predicate).length : null;
  const failedFirst = countInvoices((invoice) => firstInvoices.has(invoice) && failedAttempt(invoice) && inPeriod(invoice.createdAt));
  const recoveredFirst = countInvoices((invoice) => firstInvoices.has(invoice) && invoice.status === "paid" && invoice.attemptCount > 1 && inPeriod(invoice.paidAt));
  const failedRenewals = countInvoices((invoice) => !firstInvoices.has(invoice) && failedAttempt(invoice) && inPeriod(invoice.createdAt));
  const recoveredRenewals = countInvoices((invoice) => !firstInvoices.has(invoice) && invoice.status === "paid" && invoice.attemptCount > 1 && inPeriod(invoice.paidAt));
  const revenue = invoices
    ? invoices.filter((invoice) => invoice.status === "paid" && inPeriod(invoice.paidAt)).reduce((sum, invoice) => sum + invoice.amountPaidMinorUnits, 0)
    : null;
  const stripeMissing = "Stripe invoices could not be read, so this is not shown";

  const subscriptionsByOwner = new Map<string, FunnelSubscription[]>();
  for (const row of subscriptions) subscriptionsByOwner.set(row.ownerId, [...(subscriptionsByOwner.get(row.ownerId) ?? []), row]);
  const returning = new Set(subscriptions.filter((row) => inPeriod(row.createdAt) &&
    (subscriptionsByOwner.get(row.ownerId) ?? []).some((other) => other !== row && time(other.createdAt) < time(row.createdAt))).map((row) => row.ownerId)).size;

  const cohort = accounts.filter((account) => inPeriod(account.createdAt));
  const rate = (key: string, label: string, numerator: number, denominator: number): FunnelRate =>
    ({ key, label, numerator, denominator, percent: denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null });
  const trialsEnded = endedInPeriod.length;

  if (input.webAnalytics === "not-enabled") notes.push("Visitors, registration attempts and pricing-page visits come from Vercel Web Analytics, which is not enabled, so they were never recorded. They are shown as not recorded, not as zero.");
  else notes.push("Vercel Web Analytics is enabled: visitors, sources and pricing-page visits are in the Vercel dashboard (Analytics). They are not copied here.");
  if (input.testIds === null) notes.push("Sign-in addresses could not be checked, so test accounts are counted with customers in this view.");
  if (!invoices && input.invoiceNote) notes.push(input.invoiceNote);
  if (Number.isFinite(logStart)) notes.push(`The server conversion log has recorded first charges above $0 since ${new Date(logStart).toISOString().slice(0, 10)}.`);
  notes.push("School access codes open MathNexa in one browser without an account and keep no record, so school-code users are not counted anywhere here and never as subscribers.");
  if (cohort.length > 0 && cohort.length < 20) notes.push(`Rates are based on ${cohort.length} new account${cohort.length === 1 ? "" : "s"}; small numbers swing widely.`);

  const notRecorded = (key: string, label: string, detail: string): FunnelMetric => ({ key, label, value: null, detail });
  return Object.freeze({
    state: readFailures > 0 ? "partial" : "ready",
    period,
    environment,
    segments: Object.freeze({ genuine: accounts.length, owner: owner.size, test: input.testIds === null ? null : test.size, schoolCode: null }),
    acquisition: Object.freeze([
      notRecorded("visitors", "Visitors", input.webAnalytics === "enabled" ? "See Vercel Web Analytics" : "Not recorded: Web Analytics is not enabled"),
      notRecorded("registration-attempts", "Registration attempts", "Not recorded: only completed sign-ups are kept"),
      { key: "registrations", label: "Accounts created", value: cohort.length, detail: "Completed sign-ups" },
      { key: "verified", label: "Emails confirmed", value: accounts.filter((account) => inPeriod(account.emailConfirmedAt)).length, detail: "Confirmation links opened" },
      notRecorded("pricing-visits", "Pricing page visits", input.webAnalytics === "enabled" ? "See Vercel Web Analytics" : "Not recorded: Web Analytics is not enabled"),
      { key: "checkout-attempts", label: "Trial checkout attempts", value: new Set(input.acceptances.filter((row) => known(row.ownerId) && inPeriod(row.at)).map((row) => row.ownerId)).size, detail: "Accounts that agreed to the terms and asked for Stripe" },
      { key: "stripe-pages", label: "Stripe pages opened", value: input.stripePagesOpened.filter((row) => known(row.ownerId) && inPeriod(row.at)).length, detail: "Secure Stripe checkout pages created" }
    ]),
    trials: Object.freeze([
      { key: "trial-activations", label: "Trials started", value: accounts.filter((account) => inPeriod(account.trialRedeemedAt)).length, detail: "One-time 24-hour trials activated" },
      { key: "trials-ended", label: "Trials ended", value: trialsEnded, detail: "24-hour trials that finished in this period" },
      { key: "trials-expired", label: "Trials ended without paying", value: endedWithoutPayment.length, detail: `${canceledDuringTrial} canceled before the trial ended` }
    ]),
    payments: Object.freeze<FunnelMetric[]>([
      { key: "first-payments", label: "Genuine first payments", value: genuineFirstPayments, detail: firstPaymentDetail },
      { key: "failed-first", label: "Failed first payments", value: failedFirst, detail: failedFirst === null ? stripeMissing : "First charges that were declined at least once" },
      { key: "recovered-first", label: "Recovered first payments", value: recoveredFirst, detail: recoveredFirst === null ? stripeMissing : "Declined first charges later paid" },
      { key: "failed-renewals", label: "Failed renewals", value: failedRenewals, detail: failedRenewals === null ? stripeMissing : "Monthly charges declined at least once" },
      { key: "recovered-renewals", label: "Recovered renewals", value: recoveredRenewals, detail: recoveredRenewals === null ? stripeMissing : "Declined monthly charges later paid" },
      { key: "revenue", label: "Revenue collected", value: revenue, detail: revenue === null ? stripeMissing : "Paid invoices above $0, before refunds and Stripe fees", format: "usd" },
      { key: "refund-requests", label: "Refund requests", value: input.refundRequests.filter((row) => known(row.ownerId) && inPeriod(row.at)).length, detail: "First-charge refund reviews requested" },
      { key: "returning", label: "Returning subscribers", value: returning, detail: "Accounts that subscribed again after an earlier subscription" }
    ]),
    sources: Object.freeze<FunnelMetric[]>(input.adClickAccounts === null ? [
      { key: "ads-accounts", label: "Accounts from a Google Ads click", value: null, detail: "The ad-click records could not be read" }
    ] : [
      { key: "ads-accounts", label: "Accounts from a Google Ads click", value: cohort.filter((account) => input.adClickAccounts!.has(account.id)).length, detail: `of ${cohort.length} accounts created; Search and Performance Max are split in Google Ads` },
      { key: "ads-trials", label: "Trials from a Google Ads click", value: accounts.filter((account) => inPeriod(account.trialRedeemedAt) && input.adClickAccounts!.has(account.id)).length, detail: "Trials started by accounts that arrived from an ad" },
      { key: "ads-first-payments", label: "First payments from a Google Ads click", value: firstPaymentIds === null ? null : [...firstPaymentIds].filter((id) => input.adClickAccounts!.has(id)).length, detail: firstPaymentIds === null ? "Not recorded for this period" : "Genuine first payments by accounts that arrived from an ad" },
      notRecorded("other-sources", "Facebook, TikTok, YouTube, search, direct, referral", input.webAnalytics === "enabled" ? "Sign-up sources are in Vercel Web Analytics (event sign_up_submitted)" : "Not recorded: needs Web Analytics")
    ]),
    current: Object.freeze([
      { key: "active-trials", label: "Trials running now", value: subscriptions.filter((row) => row.status === "trialing").length, detail: "Right now, whatever the period" },
      { key: "active-paid", label: "Active paid subscriptions", value: subscriptions.filter((row) => row.status === "active").length, detail: "Right now; includes any set to cancel at the end of the month" },
      { key: "past-due", label: "Past due", value: subscriptions.filter((row) => row.status === "past_due" || row.status === "unpaid").length, detail: "Right now; access is paused until Stripe collects" },
      { key: "canceled", label: "Canceled in this period", value: subscriptions.filter((row) => inPeriod(row.canceledAt)).length, detail: "Subscriptions that ended or were set to end" }
    ]),
    rates: Object.freeze([
      rate("verify-rate", "Confirmed their email", cohort.filter((account) => account.emailConfirmedAt).length, cohort.length),
      rate("trial-rate", "Started a trial", cohort.filter((account) => account.trialRedeemedAt).length, cohort.length),
      rate("paid-rate", "Became paying customers", cohort.filter((account) => everPaid(account.id)).length, cohort.length),
      rate("trial-to-paid", "Trials that ended in a payment", endedInPeriod.filter((trial) => everPaid(trial.id)).length, trialsEnded)
    ]),
    notes: Object.freeze(notes)
  });
}
