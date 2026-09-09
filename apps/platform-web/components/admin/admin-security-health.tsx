import type { AdminSecurityHealthSnapshot, SecurityClassSummary, SecurityWindowKey } from "@/lib/admin/security-health-model";
import { SECURITY_WINDOWS, describeWindowSeconds } from "@/lib/admin/security-health-model";
import type { SecuritySeverity } from "@/lib/observability/security-schema";

type Props = Readonly<{ snapshot: AdminSecurityHealthSnapshot; csrfToken: string; result?: string | undefined }>;

const SEVERITY_ORDER: readonly SecuritySeverity[] = ["critical", "high", "medium", "info"];
const SEVERITY_TONE: Readonly<Record<SecuritySeverity, string>> = { critical: "danger", high: "attention", medium: "watch", info: "neutral" };
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const when = (value: string | null): string => value ? `${dateTime.format(new Date(value))} UTC` : "Never";
const count = (value: number): string => value.toLocaleString("en-US");

function Severity({ severity }: Readonly<{ severity: SecuritySeverity }>) {
  // The tone is decorative; the word is the status.
  return <span className="admin-severity" data-tone={SEVERITY_TONE[severity]}>{severity}</span>;
}

function resultMessage(result: string | undefined): string | null {
  if (!result) return null;
  if (result === "csrf-denied") return "The request was blocked: the admin page had expired. Reload and try again.";
  if (result === "invalid-scenario") return "The scenario, reason or confirmation was missing. Nothing was generated.";
  if (result === "unavailable") return "The admin repository is unavailable. Nothing was generated.";
  if (result.startsWith("synthetic-failed-")) return `The synthetic scenario could not be stored (${result.slice("synthetic-failed-".length).replaceAll("-", " ")}). Check the pipeline status below.`;
  const match = /^synthetic-(.+)-stored-(\d+)-alerts-(\d+)$/.exec(result);
  if (match) return `Synthetic scenario "${match[1]}" ran: ${match[2]} event(s) stored, ${match[3]} synthetic alert(s) fired.`;
  return `Operation result: ${result.replaceAll("-", " ")}.`;
}

function ClassRows({ classes }: Readonly<{ classes: readonly SecurityClassSummary[] }>) {
  return <>{classes.map((item) => <tr key={item.eventType}>
    <th scope="row"><code>{item.eventType}</code><small>{item.summary}</small></th>
    <td><Severity severity={item.severity} /></td>
    <td>{item.source}</td>
    <td>{count(item.hour)}</td>
    <td>{count(item.day)}</td>
    <td>{count(item.week)}</td>
    <td>{when(item.lastOccurredAt)}</td>
  </tr>)}</>;
}

export function AdminSecurityHealth({ snapshot, csrfToken, result }: Props) {
  const message = resultMessage(result);
  const environmentLabel = snapshot.environment.toUpperCase();
  const pipelineTone = snapshot.sinkMode === "database" || snapshot.drainConfigured ? "healthy" : "attention";
  return <div className="admin-ops-page admin-security-page">
    <header>
      <p className="admin-eyebrow">Security observability · {environmentLabel}</p>
      <h1>Security Health</h1>
      <p>Redacted security events collected from every protective control, classified by severity and reviewed here. Counts are server-clock windows in UTC. No payloads, addresses, emails or identifiers are stored or shown.</p>
    </header>

    {message ? <div className="admin-state-banner" role="status">{message}</div> : null}
    {snapshot.state !== "ready" ? <div className="admin-state-banner admin-state-danger" role="alert"><strong>{snapshot.state === "unavailable" ? "The security event store is unavailable." : "Part of the security event store is unavailable."}</strong> Missing sections are shown as unavailable; no value has been estimated.</div> : null}

    <section className="admin-ops-summary" aria-labelledby="security-pipeline">
      <h2 id="security-pipeline">Observability pipeline</h2>
      <dl>
        <div><dt>Deployment label</dt><dd>{environmentLabel}</dd></div>
        <div><dt>Event sink</dt><dd data-tone={pipelineTone}>{snapshot.sinkMode === "database" ? "console + database (in-process)" : "console only"}</dd></div>
        <div><dt>Log drain receiver</dt><dd data-tone={snapshot.drainConfigured ? "healthy" : "neutral"}>{snapshot.drainConfigured ? "configured" : "not configured"}</dd></div>
        <div><dt>Alert webhook</dt><dd data-tone={snapshot.alertWebhookConfigured ? "healthy" : "neutral"}>{snapshot.alertWebhookConfigured ? "configured" : "record only"}</dd></div>
        <div><dt>Last event received</dt><dd data-tone={snapshot.lastEventAt ? "healthy" : "attention"}>{when(snapshot.lastEventAt)}</dd></div>
        <div><dt>Retention</dt><dd>{snapshot.retentionDays} days · alerts 90 days</dd></div>
        {snapshot.pipeline.map((item) => <div key={item.source}><dt>Ingest · {item.source}</dt><dd>{count(item.eventsLastDay)} in 24 h · last {when(item.lastReceivedAt)}</dd></div>)}
      </dl>
      <p className="admin-honesty-note">A pipeline that stops delivering shows here as a stale “last event received”. Pipeline failures are reported to the console log only, so a failing store can never recurse into itself.</p>
    </section>

    <section aria-labelledby="security-severity">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Real events by severity</p><h2 id="security-severity">Severity by window</h2></div><span>Synthetic events excluded</span></div>
      <div className="admin-security-table" role="region" aria-label="Security event counts by severity and window" tabIndex={0}>
        <table>
          <caption className="admin-visually-hidden">Counts of real security events per severity over the last hour, 24 hours and 7 days</caption>
          <thead><tr><th scope="col">Severity</th>{SECURITY_WINDOWS.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
          <tbody>{SEVERITY_ORDER.map((severity) => <tr key={severity}>
            <th scope="row"><Severity severity={severity} /></th>
            {SECURITY_WINDOWS.map(([key]) => <td key={key}>{count(snapshot.severityTotals[key as SecurityWindowKey][severity])}</td>)}
          </tr>)}
          <tr><th scope="row">Synthetic (test) events</th>{SECURITY_WINDOWS.map(([key]) => <td key={key}>{count(snapshot.syntheticTotals[key as SecurityWindowKey])}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="security-top">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Last 24 hours</p><h2 id="security-top">Top event classes</h2></div></div>
      {snapshot.topClasses.length ? <ol className="admin-security-top">{snapshot.topClasses.map((item) => <li key={item.eventType}><span><code>{item.eventType}</code> <Severity severity={item.severity} /></span><strong>{count(item.day)}</strong></li>)}</ol> : <div className="admin-library-empty"><strong>No real security events in the last 24 hours</strong><p>Nothing has been estimated.</p></div>}
    </section>

    <section aria-labelledby="security-classes">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">All classes seen in 7 days</p><h2 id="security-classes">Event classes by control</h2></div></div>
      {snapshot.groups.every((group) => group.classes.length === 0) ? <div className="admin-library-empty"><strong>No real security events in the last 7 days</strong><p>Blocked attempts, denials, throttling and webhook refusals will appear here as they occur.</p></div> : snapshot.groups.filter((group) => group.classes.length > 0).map((group) => <div className="admin-security-table" role="region" aria-label={group.label} tabIndex={0} key={group.key}>
        <table>
          <caption>{group.label}</caption>
          <thead><tr><th scope="col">Event class</th><th scope="col">Severity</th><th scope="col">Source</th><th scope="col">1 h</th><th scope="col">24 h</th><th scope="col">7 d</th><th scope="col">Last seen</th></tr></thead>
          <tbody><ClassRows classes={group.classes} /></tbody>
        </table>
      </div>)}
    </section>

    <section aria-labelledby="security-alerts">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Deduplicated, cooled down</p><h2 id="security-alerts">Alerts fired</h2></div><span>Newest first</span></div>
      {snapshot.recentAlerts.length ? <div className="admin-security-table" role="region" aria-label="Security alerts" tabIndex={0}>
        <table>
          <caption className="admin-visually-hidden">Security alerts, newest first</caption>
          <thead><tr><th scope="col">Fired</th><th scope="col">Severity</th><th scope="col">Rule</th><th scope="col">Count</th><th scope="col">Window</th><th scope="col">Kind</th><th scope="col">Delivery</th><th scope="col">Correlation</th></tr></thead>
          <tbody>{snapshot.recentAlerts.map((alert) => <tr key={alert.correlationId}>
            <td>{when(alert.firedAt)}</td>
            <td><Severity severity={alert.severity} /></td>
            <td><code>{alert.ruleKey}</code></td>
            <td>{count(alert.count)} / {count(alert.threshold)}</td>
            <td>{describeWindowSeconds(alert.windowSeconds)}</td>
            <td>{alert.synthetic ? "SYNTHETIC TEST" : "real"} · {alert.environment.toUpperCase()}</td>
            <td>{alert.delivery}</td>
            <td className="admin-security-mono">{alert.correlationId}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="admin-library-empty"><strong>No alerts have fired</strong><p>Rules are listed below with their thresholds.</p></div>}
    </section>

    <section aria-labelledby="security-recent">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Redacted evidence</p><h2 id="security-recent">Recent events</h2></div><span>Newest first · up to 60</span></div>
      {snapshot.recentEvents.length ? <div className="admin-security-table" role="region" aria-label="Recent security events" tabIndex={0}>
        <table>
          <caption className="admin-visually-hidden">Recent security events, newest first</caption>
          <thead><tr><th scope="col">Occurred</th><th scope="col">Severity</th><th scope="col">Event</th><th scope="col">Outcome</th><th scope="col">Kind</th><th scope="col">Detail</th><th scope="col">Correlation</th></tr></thead>
          <tbody>{snapshot.recentEvents.map((event, index) => <tr key={`${event.correlationId}-${event.occurredAt}-${index}`}>
            <td>{when(event.occurredAt)}</td>
            <td><Severity severity={event.severity} /></td>
            <td><code>{event.eventType}</code><small>{event.source}</small></td>
            <td>{event.outcome}</td>
            <td>{event.synthetic ? "SYNTHETIC TEST" : "real"} · {event.ingestSource}</td>
            <td>{event.detail || "—"}</td>
            <td className="admin-security-mono">{event.correlationId}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="admin-library-empty"><strong>No events recorded</strong><p>Nothing has been estimated.</p></div>}
    </section>

    <section aria-labelledby="security-rules">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Reference</p><h2 id="security-rules">Alert rules</h2></div><span>{snapshot.rules.length} rules</span></div>
      <div className="admin-security-table" role="region" aria-label="Alert rules" tabIndex={0}>
        <table>
          <caption className="admin-visually-hidden">Alert rules with thresholds, windows and cooldowns</caption>
          <thead><tr><th scope="col">Rule</th><th scope="col">Severity</th><th scope="col">Threshold</th><th scope="col">Window</th><th scope="col">Cooldown</th><th scope="col">Owner action</th></tr></thead>
          <tbody>{snapshot.rules.map((rule) => <tr key={rule.key}>
            <th scope="row"><code>{rule.key}</code><small>{rule.title}</small></th>
            <td><Severity severity={rule.severity} /></td>
            <td>{count(rule.threshold)}</td>
            <td>{describeWindowSeconds(rule.windowSeconds)}</td>
            <td>{describeWindowSeconds(rule.cooldownSeconds)}</td>
            <td>{rule.ownerAction}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="security-synthetic">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Alert test mode</p><h2 id="security-synthetic">Synthetic scenario</h2></div><span>{snapshot.syntheticAllowed ? `${environmentLabel} only` : "Unavailable on production"}</span></div>
      {snapshot.syntheticAllowed ? <form className="admin-security-form" method="post" action="/admin/security/synthetic">
        <p>Generates clearly marked <strong>SYNTHETIC · {environmentLabel} · TEST EVENT</strong> records through the real store and the real alert rules. Synthetic events are counted in their own partition and can never raise or mask a real alert. Every run is written to the immutable audit log.</p>
        <input type="hidden" name="csrfToken" value={csrfToken} />
        <label>Scenario<select name="scenario" required defaultValue="">
          <option value="" disabled>Choose a scenario</option>
          {snapshot.scenarios.map((scenario) => <option key={scenario.key} value={scenario.key}>{scenario.title}{scenario.expectedAlert ? ` — fires ${scenario.expectedAlert}` : " — no alert"}</option>)}
        </select></label>
        <ul className="admin-security-scenarios">{snapshot.scenarios.map((scenario) => <li key={scenario.key}><code>{scenario.key}</code> — {scenario.description}</li>)}</ul>
        <label>Required reason<textarea name="reason" required minLength={3} maxLength={500} /></label>
        <label className="admin-confirm-check"><input type="checkbox" name="confirm" value="synthetic" required />I confirm this generates synthetic {environmentLabel} test events only.</label>
        <button className="admin-secondary-action" type="submit">Run synthetic scenario</button>
      </form> : <p className="admin-honesty-note">Synthetic scenarios exist only on staging, preview and local deployments. A production deployment refuses them before reading the request.</p>}
    </section>

    <p className="admin-honesty-note">Generated {when(snapshot.generatedAt)}. Windows are computed by the database clock; nothing on this page trusts a browser clock.</p>
  </div>;
}
