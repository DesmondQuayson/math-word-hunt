import Link from "next/link";

import type { AdminAnalyticsOperationsSnapshot } from "@/lib/admin/analytics-operations";

type Props = Readonly<{ snapshot: AdminAnalyticsOperationsSnapshot; csrfToken: string; section: "analytics" | "settings" | "audit-log"; result?: string }>;
const format = (value: number | null) => value === null ? "Unavailable" : value.toLocaleString();
const bytes = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(value / 1_048_576);

export function AdminAnalyticsOperations({ snapshot, csrfToken, section, result }: Props) {
  if (section === "analytics") return <Analytics snapshot={snapshot} />;
  if (section === "audit-log") return <Audit snapshot={snapshot} />;
  return <Operations snapshot={snapshot} csrfToken={csrfToken} result={result} />;
}

function RangeForm({ snapshot }: Readonly<{ snapshot: AdminAnalyticsOperationsSnapshot }>) {
  return <form className="admin-range-form" method="get" action="/admin">
    <input type="hidden" name="section" value="analytics" />
    <label>From<input name="from" type="date" required defaultValue={snapshot.range.from} /></label>
    <label>Through<input name="to" type="date" required defaultValue={snapshot.range.to} /></label>
    <button className="admin-secondary-action" type="submit">Apply date range</button>
    <a className="admin-secondary-action" href={`/admin/analytics/export?from=${encodeURIComponent(snapshot.range.from)}&to=${encodeURIComponent(snapshot.range.to)}`}>Export aggregate CSV</a>
  </form>;
}

function Analytics({ snapshot }: Readonly<{ snapshot: AdminAnalyticsOperationsSnapshot }>) {
  return <div className="admin-ops-page">
    <header><p className="admin-eyebrow">Privacy-conscious reporting</p><h1>Aggregate analytics</h1><p>Counts are derived without student profiles, account emails, IP histories, or identifiable learning records. Missing signals remain visibly unavailable.</p></header>
    <RangeForm snapshot={snapshot} />
    {snapshot.state !== "ready" ? <div className="admin-state-banner admin-state-danger" role="alert">Some aggregate signals are unavailable. No missing value has been estimated.</div> : null}
    <section aria-labelledby="aggregate-metrics"><div className="admin-section-heading"><div><p className="admin-eyebrow">Selected range</p><h2 id="aggregate-metrics">Growth, access, and engagement</h2></div><span>{snapshot.range.from} through {snapshot.range.to}</span></div>
      <div className="admin-metric-grid">{snapshot.metrics.map((metric, index) => <article className="admin-metric" key={metric.key}><span className="admin-metric-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{metric.label}</p><strong>{format(metric.value)}</strong><small>{metric.detail}</small></article>)}</div>
    </section>
    <section className="admin-popular-grid" aria-labelledby="popular-content"><div className="admin-section-heading"><div><p className="admin-eyebrow">Aggregate content signals</p><h2 id="popular-content">Popular curriculum paths</h2></div></div>
      {Object.entries(snapshot.popular).map(([kind, items]) => <article key={kind}><h3>{kind[0].toUpperCase() + kind.slice(1)}</h3>{items.length ? <ol>{items.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></li>)}</ol> : <p>No {kind} signal is available in this range.</p>}</article>)}
    </section>
    <ProviderGrid snapshot={snapshot} />
  </div>;
}

function ProviderGrid({ snapshot }: Readonly<{ snapshot: AdminAnalyticsOperationsSnapshot }>) {
  return <section aria-labelledby="provider-health"><div className="admin-section-heading"><div><p className="admin-eyebrow">Operational evidence</p><h2 id="provider-health">Provider health</h2></div></div><div className="admin-provider-grid">
    {snapshot.providers.map((provider) => <article key={provider.provider}><span data-tone={provider.state}>{provider.state.replaceAll("-", " ")}</span><h3>{provider.provider}</h3><p>{provider.detail}</p></article>)}
  </div></section>;
}

function Operations({ snapshot, csrfToken, result }: Readonly<{ snapshot: AdminAnalyticsOperationsSnapshot; csrfToken: string; result?: string }>) {
  return <div className="admin-ops-page">
    <header><p className="admin-eyebrow">Owner operations</p><h1>System health and controls</h1><p>Feature flags are server-owned, version-checked, MFA-bound, and written to the immutable audit ledger. Emergency changes require a fresh admin session.</p></header>
    {result ? <div className="admin-state-banner" role="status">Operation result: {result.replaceAll("-", " ")}.</div> : null}
    <section className="admin-ops-summary" aria-labelledby="system-version"><h2 id="system-version">Build and database</h2><dl>
      <div><dt>Build</dt><dd>{snapshot.build.id}</dd></div><div><dt>Environment</dt><dd>{snapshot.build.environment}</dd></div>
      <div><dt>Applied migrations</dt><dd>{format(snapshot.build.migrationCount)}</dd></div><div><dt>Latest migration</dt><dd>{snapshot.build.latestMigration ?? "Unavailable"}</dd></div>
      <div><dt>Webhook queue</dt><dd>{format(snapshot.webhookQueue.pending)} pending · {format(snapshot.webhookQueue.failed)} failed</dd></div>
      <div><dt>Private storage</dt><dd>{format(snapshot.storage.objects)} objects · {bytes(snapshot.storage.bytes)} · {format(snapshot.storage.buckets)} buckets</dd></div>
    </dl></section>
    <ProviderGrid snapshot={snapshot} />
    <section aria-labelledby="server-flags"><div className="admin-section-heading"><div><p className="admin-eyebrow">Audited controls</p><h2 id="server-flags">Server feature flags</h2></div></div><div className="admin-flag-grid">
      {snapshot.flags.map((flag) => <article key={flag.key}><header><div><h3>{flag.key.replaceAll("-", " ")}</h3><p>Version {flag.version} · updated {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(flag.updatedAt))}</p></div><span data-tone={flag.enabled ? "attention" : "healthy"}>{flag.enabled ? "enabled" : "disabled"}</span></header>
        {flag.message ? <p>{flag.message}</p> : null}
        <form method="post" action="/admin/operations/flag"><input type="hidden" name="csrfToken" value={csrfToken}/><input type="hidden" name="flag" value={flag.key}/><input type="hidden" name="enabled" value={String(!flag.enabled)}/><input type="hidden" name="expectedVersion" value={flag.version}/>
          {(flag.key === "maintenance-mode" || flag.key === "announcement-published") && !flag.enabled ? <label>Public-safe message<input name="message" required maxLength={280}/></label> : <input type="hidden" name="message" value=""/>}
          <label>Required reason<textarea name="reason" required minLength={3} maxLength={500}/></label>
          {flag.key.includes("emergency") ? <label className="admin-confirm-check"><input type="checkbox" name="confirm" value={flag.key} required/>I confirm this emergency owner action.</label> : null}
          <button className={flag.key === "admin-emergency-disabled" && !flag.enabled ? "admin-danger-action" : "admin-secondary-action"} type="submit">{flag.enabled ? "Disable" : "Enable"} {flag.key.replaceAll("-", " ")}</button>
        </form>
      </article>)}
    </div></section>
    <section className="admin-ops-summary" aria-labelledby="retention-jobs"><h2 id="retention-jobs">Retention and recovery</h2><p>Aggregate event signals are retained for 400 days. Immutable admin audit and feature history are excluded from deletion.</p>
      <p>Last run: {snapshot.retention ? `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.retention.completedAt))} · ${snapshot.retention.deletedCount} expired events` : "No retention run recorded"}</p>
      <form method="post" action="/admin/operations/retention"><input type="hidden" name="csrfToken" value={csrfToken}/><label>Required reason<textarea name="reason" required minLength={3} maxLength={500}/></label><label className="admin-confirm-check"><input type="checkbox" name="confirm" value="retention" required/>I confirm this deletes only aggregate signals older than 400 days.</label><button className="admin-secondary-action" type="submit">Run bounded retention</button></form>
      <div className="admin-operation-links"><Link href="/admin?section=cms">Publish announcement content</Link><Link href="/admin?section=users">Revoke consumer sessions</Link><Link href="/admin?section=audit-log">Open immutable audit viewer</Link></div>
    </section>
  </div>;
}

function Audit({ snapshot }: Readonly<{ snapshot: AdminAnalyticsOperationsSnapshot }>) {
  return <div className="admin-ops-page"><header><p className="admin-eyebrow">Immutable evidence</p><h1>Audit log</h1><p>This owner-only view excludes IP addresses, user agents, tokens, and hidden metadata. Database triggers reject modification of the underlying ledger.</p></header>
    <a className="admin-secondary-action" href={`/admin/audit/export?from=${encodeURIComponent(snapshot.range.from)}&to=${encodeURIComponent(snapshot.range.to)}`}>Export sanitized audit CSV</a>
    {snapshot.audit.length ? <div className="admin-audit-table" role="region" aria-label="Immutable admin audit events" tabIndex={0}><table><thead><tr><th scope="col">Occurred</th><th scope="col">Action</th><th scope="col">Target</th></tr></thead><tbody>{snapshot.audit.map((event, index) => <tr key={`${event.createdAt}-${index}`}><td>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</td><td>{event.action}</td><td>{event.target ?? "—"}</td></tr>)}</tbody></table></div> : <div className="admin-library-empty"><strong>No audit events in this range</strong><p>No placeholder evidence has been created.</p></div>}
  </div>;
}
