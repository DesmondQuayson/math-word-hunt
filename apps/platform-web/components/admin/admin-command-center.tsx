"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AdminDashboardSnapshot } from "@/lib/admin/dashboard";
import { formatAdminDateTime, formatAdminNumber } from "@/lib/admin/format";
import { ADMIN_SECTIONS } from "@/lib/admin/navigation";

type AdminCommandCenterProps = Readonly<{
  snapshot: AdminDashboardSnapshot;
  activeSection: string;
  csrfToken: string;
  signOutAction: (formData: FormData) => void | Promise<void>;
  moduleContent?: ReactNode;
}>;

function sectionHref(key: string): string {
  return key === "dashboard" ? "/admin" : `/admin?section=${encodeURIComponent(key)}`;
}

function readableAction(value: string): string {
  return value.replace(/^admin\./, "").replaceAll(".", " / ").replaceAll("-", " ");
}

export function AdminCommandCenter({ snapshot, activeSection, csrfToken, signOutAction, moduleContent }: AdminCommandCenterProps) {
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = ADMIN_SECTIONS.find(([key]) => key === activeSection) ?? ADMIN_SECTIONS[0];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? ADMIN_SECTIONS.filter(([, label, detail]) => `${label} ${detail}`.toLowerCase().includes(normalized)) : ADMIN_SECTIONS;
  }, [query]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);

  return <div className="admin-command-center">
    <aside className="admin-rail" aria-label="Super Admin navigation">
      <div className="admin-rail-brand"><span aria-hidden="true">N</span><div><strong>MathNexa</strong><small>Owner operations</small></div></div>
      <label className="admin-command-search">
        <span>Find an admin area</span>
        <span className="admin-command-input"><span aria-hidden="true">⌕</span><input ref={searchRef} aria-label="Find an admin area" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules" /><kbd>Ctrl K</kbd></span>
      </label>
      <nav aria-label="Admin modules">
        <ul className="admin-module-list">
          {filtered.map(([key, label, detail], index) => <li key={key}>
            <Link href={sectionHref(key)} aria-current={selected[0] === key ? "page" : undefined}>
              <span className="admin-module-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span><strong>{label}</strong><small>{detail}</small></span>
            </Link>
          </li>)}
        </ul>
        {filtered.length === 0 ? <p className="admin-nav-empty" role="status">No admin areas match “{query}”.</p> : null}
      </nav>
      <div className="admin-owner-seal"><span aria-hidden="true">AAL2</span><div><strong>Owner verified</strong><small>Short server session</small></div></div>
    </aside>

    <div className="admin-workspace">
      <header className="admin-topbar">
        <div><p className="admin-kicker">Super Admin / {selected[1]}</p><p className="admin-session-note">Server-authorized · MFA complete · owner only</p></div>
        <form action={signOutAction}><input type="hidden" name="csrfToken" value={csrfToken} /><button className="admin-signout" type="submit">End admin session</button></form>
      </header>
      {!online ? <div className="admin-state-banner" role="alert"><strong>You are offline.</strong> Server operations are unavailable; no changes will be attempted.</div> : null}
      {snapshot.state === "unavailable" ? <div className="admin-state-banner admin-state-danger" role="alert"><strong>Live admin data is unavailable.</strong> The dashboard failed closed and displays no estimated values.</div> : null}

      <div className="admin-main" id="admin-main">
        <nav className="admin-breadcrumbs" aria-label="Breadcrumb"><ol><li><Link href="/admin">Super Admin</Link></li><li aria-current="page">{selected[1]}</li></ol></nav>
        <AdminPrimaryActions section={selected[0]} />
        {selected[0] === "dashboard" ? <AdminDashboard snapshot={snapshot} /> : moduleContent ?? <AdminModuleEmpty title={selected[1]} detail={selected[2]} />}
      </div>
    </div>
  </div>;
}

const PRIMARY_ACTIONS:Readonly<Record<string,readonly Readonly<{label:string;href:string}>[]>>={dashboard:[{label:"Add Game",href:"/admin?section=games#add-games"},{label:"Add Homework",href:"/admin?section=homework#add-homework"},{label:"Add Quiz",href:"/admin?section=quizzes#add-quizzes"},{label:"Configure MAP Prep",href:"/admin?section=map-prep#map-prep-editor"},{label:"Manage Taxonomy",href:"/admin?section=homework#homework-taxonomy"}],games:[{label:"Add Game",href:"/admin?section=games#add-games"}],homework:[{label:"Add Homework",href:"/admin?section=homework#add-homework"}],quizzes:[{label:"Add Quiz",href:"/admin?section=quizzes#add-quizzes"}],"map-prep":[{label:"Edit Destination",href:"/admin?section=map-prep#map-prep-editor"}]};
function AdminPrimaryActions({section}:{section:string}){const actions=PRIMARY_ACTIONS[section]??[];if(!actions.length)return null;return <nav className="admin-primary-actions" aria-label="Primary authoring actions"><span>Quick operations</span>{actions.map((action,index)=><Link key={action.label} className={index===0?"admin-primary-action":"admin-secondary-action"} href={action.href}>{action.label}</Link>)}</nav>}

function AdminDashboard({ snapshot }: Readonly<{ snapshot: AdminDashboardSnapshot }>) {
  return <div className="admin-dashboard">
    <section className="admin-dashboard-intro" aria-labelledby="admin-dashboard-title">
      <div><p className="admin-eyebrow">Operational picture</p><h1 id="admin-dashboard-title">MathNexa Super Admin</h1><p>Review content readiness, subscriber signals, and system health from one owner-only workspace.</p></div>
      <div className="admin-readiness-dial" aria-label={`System health: ${snapshot.systemHealth}`}><span>SYS</span><strong>{snapshot.systemHealth === "operational" ? "Ready" : "Check"}</strong><small>fail-closed controls</small></div>
    </section>

    <section aria-labelledby="admin-metrics-title"><div className="admin-section-heading"><div><p className="admin-eyebrow">Today’s ledger</p><h2 id="admin-metrics-title">Content and commerce</h2></div><span>Live server projections</span></div>
      <div className="admin-metric-grid">{snapshot.metrics.map((metric, index) => <article className="admin-metric" key={metric.key}>
        <span className="admin-metric-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{metric.label}</p><strong>{metric.value === null ? "—" : formatAdminNumber(metric.value)}</strong><small>{metric.detail}</small>
      </article>)}</div>
    </section>

    <div className="admin-lower-grid">
      <section className="admin-health-panel" aria-labelledby="admin-health-title"><p className="admin-eyebrow">Provider watch</p><h2 id="admin-health-title">System health</h2>
        <dl>
          <div><dt>Application</dt><dd data-tone={snapshot.systemHealth === "operational" ? "good" : "warning"}>{snapshot.systemHealth}</dd></div>
          <div><dt>Email</dt><dd data-tone={snapshot.emailHealth === "healthy" ? "good" : snapshot.emailHealth === "attention" ? "warning" : "neutral"}>{snapshot.emailHealth.replaceAll("-", " ")}</dd></div>
          <div><dt>Webhooks</dt><dd data-tone={snapshot.webhookHealth === "healthy" ? "good" : snapshot.webhookHealth === "attention" ? "warning" : "neutral"}>{snapshot.webhookHealth.replaceAll("-", " ")}</dd></div>
          <div><dt>Private storage</dt><dd data-tone={snapshot.storageHealth === "healthy" ? "good" : "warning"}>{snapshot.storageHealth}</dd></div>
          <div><dt>Game package validation</dt><dd data-tone={snapshot.packageHealth === "healthy" ? "good" : snapshot.packageHealth === "attention" ? "warning" : "neutral"}>{snapshot.packageHealth.replaceAll("-", " ")}</dd></div>
          <div><dt>PDF quarantine</dt><dd data-tone={snapshot.pdfQuarantineCount === 0 ? "good" : "warning"}>{snapshot.pdfQuarantineCount ?? "unavailable"}</dd></div>
          <div><dt>ZIP quarantine</dt><dd data-tone={snapshot.packageQuarantineCount === 0 ? "good" : "warning"}>{snapshot.packageQuarantineCount ?? "unavailable"}</dd></div>
        </dl><p className="admin-honesty-note">Missing provider signals are never shown as healthy. Detailed evidence is available in Analytics and Settings.</p>
      </section>
      <section className="admin-audit-panel" aria-labelledby="admin-audit-title"><div className="admin-section-heading"><div><p className="admin-eyebrow">Immutable evidence</p><h2 id="admin-audit-title">Recent admin actions</h2></div><Link href="/admin?section=audit-log">Open audit log</Link></div>
        {snapshot.recentActions.length ? <ol>{snapshot.recentActions.map((event, index) => <li key={`${event.createdAt}-${index}`}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><strong>{readableAction(event.action)}</strong><small>{formatAdminDateTime(event.createdAt)}{event.target ? ` · ${event.target}` : ""}</small></div></li>)}</ol> : <div className="admin-empty-state"><strong>No admin actions yet</strong><p>The immutable ledger will appear here after an authorized owner action.</p></div>}
      </section>
    </div>
  </div>;
}

function AdminModuleEmpty({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return <section className="admin-module-empty" aria-labelledby="admin-module-title"><span aria-hidden="true">∅</span><p className="admin-eyebrow">Module foundation</p><h1 id="admin-module-title">{title}</h1><p>{detail} controls are not active in this phase. The protected navigation and truthful empty state are ready; no placeholder data has been created.</p><Link href="/admin">Return to dashboard</Link></section>;
}
