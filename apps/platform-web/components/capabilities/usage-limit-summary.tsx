export function UsageLimitSummary({ label, current, maximum, planLabel, headingId }: Readonly<{ label: string; current: number; maximum: number; planLabel: string; headingId: string }>) {
  const remaining = Math.max(0, maximum - current);
  return <section className="usage-limit-summary" aria-labelledby={headingId} data-testid={`usage-${headingId}`}>
    <div>
      <p className="card-kicker">{planLabel} capacity</p>
      <h2 id={headingId}>{label}</h2>
      <p>{remaining === 0 ? "No new records can be created." : `${remaining} remaining before the current plan limit.`}</p>
    </div>
    <div className="usage-fraction" aria-label={`${current} of ${maximum} used`}><strong>{current}</strong><span>/ {maximum}</span><small>active</small></div>
    <div className="usage-track" aria-hidden="true"><span style={{ inlineSize: `${Math.min(100, maximum === 0 ? 100 : current / maximum * 100)}%` }} /></div>
  </section>;
}
