const DAY = 86_400_000;

export function publicMarkdown(value) {
  return String(value ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/[<>&|`[\]\\]/g, '').slice(0, 300);
}

export function reportingWeek(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(p => p.type === type).value;
  const localDay = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  localDay.setUTCDate(localDay.getUTCDate() - (localDay.getUTCDay() + 6) % 7);
  return localDay.toISOString().slice(0, 10);
}

export function buildReport(audit, { previous = null, now = new Date(), mode = 'live', sourceCommit = null, runUrl = null, manualProposals = [] } = {}) {
  if (audit.schemaVersion !== 1 || !Array.isArray(audit.findings) || !Array.isArray(audit.sites)) throw new Error('Unsupported audit schema');
  if (previous && (previous.schemaVersion !== 1 || previous.kind !== 'mathnexa-public-seo')) throw new Error('Unsupported previous report');
  const observed = Date.parse(audit.observedAt);
  if (!Number.isFinite(observed) || observed > now.getTime() + 60_000) throw new Error('Invalid observation time');
  const currentIds = new Set(audit.findings.map(f => f.id));
  const expectedAccess = new Set((audit.accessChecks ?? []).filter(check => check.matched).map(check => `${check.url}#http-401`));
  const successfulTargets = new Set(audit.sites.flatMap(site => [site.robots, site.sitemap, ...site.pages])
    .filter(page => page && !page.error && page.status >= 200 && page.status < 300).map(page => page.url));
  const checkAvailable = item => {
    if (!successfulTargets.has(item.target)) return false;
    if ((item.findingId ?? item.id).endsWith('#sitemap-membership')) {
      const site = audit.sites.find(s => s.pages.some(p => p.url === item.target));
      return site?.sitemap?.kind === 'urlset' && successfulTargets.has(site.sitemap.url);
    }
    return true;
  };
  const oldLedger = previous?.ledger ?? [];
  const ledger = oldLedger.map(item => {
    if (expectedAccess.has(item.id)) return { ...item, status: 'expected-access-control', checkedAt: audit.observedAt, resolutionEvidence: 'docs/showme-access-gate.md' };
    if (currentIds.has(item.id)) return { ...item, lastSeenAt: audit.observedAt, status: 'observed' };
    // A timeout or inaccessible page is not evidence that a previous problem was fixed.
    return checkAvailable(item) ? { ...item, status: 'not-observed', checkedAt: audit.observedAt } : item;
  });
  for (const finding of audit.findings) {
    if (!ledger.some(item => item.id === finding.id)) ledger.push({ ...finding, firstSeenAt: audit.observedAt, lastSeenAt: audit.observedAt, status: 'observed' });
  }
  const proposals = (previous?.proposals ?? []).map(p => expectedAccess.has(p.findingId)
    ? { ...p, status: 'closed-expected-access', currentObservation: 'expected-access-control', resolutionEvidence: 'docs/showme-access-gate.md; access boundary verified 2026-11-27' }
    : { ...p, currentObservation: currentIds.has(p.findingId) ? 'observed' : checkAvailable(p) ? 'not-observed' : 'unavailable' });
  const cycle = reportingWeek(new Date(observed));
  const sameCycle = previous?.proposalBudget?.cycle === cycle;
  const limit = sameCycle ? previous.proposalBudget.limit : previous ? 2 : 3;
  const alreadyUsed = sameCycle ? previous.proposalBudget.used : 0;
  const manualAdditions = mode === 'live' ? manualProposals.filter(p => !proposals.some(old => old.id === p.id)) : [];
  if (manualAdditions.some(p => !p.id?.startsWith('proposal:manual:') || !p.findingId?.startsWith('manual:')) || new Set(manualAdditions.map(p => p.id)).size !== manualAdditions.length) throw new Error('Invalid manual proposal registry');
  if (manualAdditions.length > Math.max(0, limit - alreadyUsed)) throw new Error('Manual proposals exceed the shared proposal budget');
  const candidates = mode === 'live' ? audit.findings.filter(f => !proposals.some(p => p.findingId === f.id)) : [];
  candidates.sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error') || a.id.localeCompare(b.id));
  const additions = candidates.slice(0, Math.max(0, limit - alreadyUsed - manualAdditions.length)).map(f => ({
    id: `proposal:${f.id}`, findingId: f.id, target: f.target, evidence: f.message,
    hypothesis: 'Resolving this observed public-page issue may improve reliable discovery or answer readability; review the intended page behavior first.',
    priority: f.severity === 'error' ? 'P1' : 'P2', status: 'awaiting-review',
    createdAt: audit.observedAt, reviewAfter: new Date(observed + 7 * DAY).toISOString().slice(0, 10),
    validation: 'Confirm the finding manually, prepare a scoped diff, preserve access rules, then repeat the affected check.',
    currentObservation: 'observed'
  }));
  const previousAgeDays = previous ? (observed - Date.parse(previous.audit.observedAt)) / DAY : null;
  return {
    schemaVersion: 1, kind: 'mathnexa-public-seo', publicDataOnly: true,
    generatedAt: now.toISOString(), mode, sourceCommit, runUrl, timezone: 'America/Chicago',
    status: mode === 'live' && audit.complete ? 'Verified' : 'Partial',
    audit, freshness: { observedAt: audit.observedAt, ageHours: Math.max(0, (now.getTime() - observed) / 3_600_000), live: mode === 'live' },
    comparison: {
      previousObservedAt: previous?.audit.observedAt ?? null,
      daysBetweenObservations: previousAgeDays,
      comparableWeeklySnapshot: previousAgeDays !== null && previousAgeDays >= 6 && previousAgeDays <= 8,
      newFindingIds: audit.findings.filter(f => !oldLedger.some(l => l.id === f.id)).map(f => f.id),
      note: 'Point-in-time public checks only. This is not a seven-day traffic or revenue comparison.'
    },
    coverage: {
      publicTechnicalAudit: audit.complete ? 'Verified' : 'Partial',
      searchConsole: 'Blocked: no verified cloud credentials or property',
      ga4: 'Blocked: no verified cloud credentials or property',
      subscriptions: 'Blocked: no authorized private aggregate data source',
      baseline28Days: 'Blocked: source data unavailable; missing is not zero',
      aiVisibility: 'Pending: no sampled AI answers collected',
      backlinks: 'Pending: no verified external-link inventory',
      contentChanges: 'Pending owner review; no production edits',
      aiExecutor: 'Not configured; this job executes deterministic checks, not a Codex or Claude session'
    },
    proposalBudget: { cycle, limit, used: alreadyUsed + manualAdditions.length + additions.length },
    ledger, proposals: [...proposals, ...manualAdditions, ...additions], newProposalIds: [...manualAdditions, ...additions].map(p => p.id)
  };
}

export function renderReport(report) {
  const lines = [
    '# MathNexa public SEO check', '',
    `Observed: ${report.audit.observedAt}. Generated: ${report.generatedAt}. Mode: ${report.mode}.`,
    `Technical check: **${report.status}**. Requests: ${report.audit.requestsUsed}/${report.audit.requestLimit}.`,
    'Scope: anonymous public HTML and crawl metadata. No private analytics, customer data, model calls, or production changes.', '',
    '| Public page | HTTP | Title | Canonical | H1 |', '| --- | --- | --- | --- | --- |'
  ];
  for (const site of report.audit.sites) {
    for (const page of site.pages) lines.push(`| ${publicMarkdown(page.url)} | ${page.status ?? 'Unavailable'} | ${publicMarkdown(page.title)} | ${publicMarkdown(page.canonical)} | ${page.h1Count ?? '—'} |`);
  }
  lines.push('', '## Protected resource checks', '');
  for (const check of report.audit.accessChecks ?? []) lines.push(`- ${publicMarkdown(check.url)}: HTTP ${check.status ?? 'unavailable'}; documented 401/noindex boundary ${check.matched ? 'verified' : 'NOT verified'}. Paid content is not audited or cached.`);
  lines.push('', '## Findings', '');
  if (!report.audit.findings.length) lines.push('No issues detected by the implemented checks. This is not proof of indexing or SEO effectiveness.');
  for (const f of report.audit.findings) lines.push(`- ${publicMarkdown(f.severity)} — ${publicMarkdown(f.target)}: ${publicMarkdown(f.message)}`);
  lines.push('', '## Review queue', '', `${report.newProposalIds.length} new proposals; ${report.proposals.length} retained proposals. Existing IDs are reused.`, '');
  for (const p of report.proposals) lines.push(`- ${publicMarkdown(p.priority)} / ${publicMarkdown(p.status)} / ${publicMarkdown(p.currentObservation)} — ${publicMarkdown(p.target)}: ${publicMarkdown(p.evidence)} Review after ${publicMarkdown(p.reviewAfter)}.`);
  lines.push('', '## Coverage limits', '');
  for (const [key, value] of Object.entries(report.coverage)) lines.push(`- ${key}: ${value}`);
  lines.push('', report.comparison.note, 'Offline replay preserves original observation timestamps and cannot demonstrate cloud execution.');
  return `${lines.join('\n')}\n`;
}
