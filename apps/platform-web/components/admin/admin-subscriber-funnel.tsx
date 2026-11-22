import { FUNNEL_PERIODS, type FunnelMetric, type SubscriberFunnelSnapshot } from "@/lib/admin/subscriber-funnel-model";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const show = (metric: FunnelMetric) => metric.value === null ? "Not recorded" : metric.format === "usd" ? usd.format(metric.value / 100) : metric.value.toLocaleString("en-US");

function PeriodForm({ snapshot }: Readonly<{ snapshot: SubscriberFunnelSnapshot }>) {
  const { period } = snapshot;
  return <form className="admin-range-form admin-funnel-period" method="get" action="/admin">
    <input type="hidden" name="section" value="funnel" />
    <label>Period<select name="period" defaultValue={period.key}>
      {FUNNEL_PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <label>From (custom)<input name="from" type="date" defaultValue={period.fromDate ?? ""} /></label>
    <label>Through (custom)<input name="to" type="date" defaultValue={period.toDate} /></label>
    <button className="admin-secondary-action" type="submit">Show</button>
  </form>;
}

function MetricGroup({ id, eyebrow, title, metrics }: Readonly<{ id: string; eyebrow: string; title: string; metrics: readonly FunnelMetric[] }>) {
  return <section aria-labelledby={id}>
    <div className="admin-section-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div></div>
    <div className="admin-metric-grid">{metrics.map((metric) => <article className="admin-metric" key={metric.key} data-recorded={metric.value === null ? "no" : "yes"}>
      <p>{metric.label}</p><strong>{show(metric)}</strong><small>{metric.detail}</small>
    </article>)}</div>
  </section>;
}

export function AdminSubscriberFunnel({ snapshot }: Readonly<{ snapshot: SubscriberFunnelSnapshot }>) {
  const { period, segments } = snapshot;
  const range = period.fromDate === null ? `all records through ${period.toDate}` : period.fromDate === period.toDate ? period.fromDate : `${period.fromDate} to ${period.toDate}`;
  return <div className="admin-ops-page admin-funnel">
    <header>
      <p className="admin-eyebrow">Server and Stripe records · US Central time</p>
      <h1>Subscriber funnel</h1>
      <p>Counts only genuine customer accounts: the Super Admin sign-in and reserved test addresses are counted separately and left out. Nothing here shows an email address or a person. Values that were never recorded say so instead of showing zero.</p>
    </header>
    <PeriodForm snapshot={snapshot} />
    {period.fallback ? <div className="admin-state-banner" role="status">That custom range could not be used (check both dates, with the first on or before the second and neither in the future), so the last 30 days are shown.</div> : null}
    {snapshot.state === "unavailable" ? <div className="admin-state-banner admin-state-danger" role="alert">The funnel records could not be read. Nothing has been estimated.</div> : null}
    {snapshot.state === "partial" ? <div className="admin-state-banner admin-state-danger" role="alert">Some records could not be read, so some counts may be low. Nothing has been estimated.</div> : null}
    <section className="admin-ops-summary" aria-labelledby="funnel-segments">
      <h2 id="funnel-segments">{period.label} · {range}</h2>
      <dl>
        <div><dt>Customer accounts counted</dt><dd>{segments.genuine.toLocaleString("en-US")}</dd></div>
        <div><dt>Owner (Super Admin) accounts left out</dt><dd>{segments.owner.toLocaleString("en-US")}</dd></div>
        <div><dt>Test accounts left out</dt><dd>{segments.test === null ? "Could not be checked" : segments.test.toLocaleString("en-US")}</dd></div>
        <div><dt>School-code users</dt><dd>Not recorded (no account is created)</dd></div>
        <div><dt>Billing records</dt><dd>{snapshot.environment === "live" ? "Live Stripe" : "Stripe test mode"}</dd></div>
      </dl>
    </section>
    <MetricGroup id="funnel-acquisition" eyebrow="Step 1" title="Visitors and sign-ups" metrics={snapshot.acquisition} />
    <MetricGroup id="funnel-trials" eyebrow="Step 2" title="Trials" metrics={snapshot.trials} />
    <MetricGroup id="funnel-payments" eyebrow="Step 3" title="Payments" metrics={snapshot.payments} />
    <MetricGroup id="funnel-current" eyebrow="Now" title="Subscriptions right now" metrics={snapshot.current} />
    <MetricGroup id="funnel-sources" eyebrow="Where they came from" title="Sources" metrics={snapshot.sources} />
    <section aria-labelledby="funnel-rates">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Accounts created in this period</p><h2 id="funnel-rates">Conversion rates</h2></div></div>
      <div className="admin-metric-grid">{snapshot.rates.map((rate) => <article className="admin-metric" key={rate.key}>
        <p>{rate.label}</p><strong>{rate.percent === null ? "—" : `${rate.percent.toLocaleString("en-US")}%`}</strong><small>{rate.denominator === 0 ? "No accounts to compare in this period" : `${rate.numerator} of ${rate.denominator}`}</small>
      </article>)}</div>
    </section>
    <section className="admin-ops-summary" aria-labelledby="funnel-notes">
      <h2 id="funnel-notes">About these numbers</h2>
      <ul className="admin-funnel-notes">{snapshot.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </section>
  </div>;
}
