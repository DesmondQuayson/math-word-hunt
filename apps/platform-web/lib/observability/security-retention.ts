import "server-only";

/**
 * Retention for the security event store.
 *
 * Events default to 30 days and are bounded to 7–90; fired alerts are kept
 * for 90 days. The bounds are enforced again inside the database function, so
 * a misconfigured value can neither disable retention nor shorten it below
 * what an incident review needs.
 */
export const DEFAULT_SECURITY_EVENT_RETENTION_DAYS = 30;
export const SECURITY_ALERT_RETENTION_DAYS = 90;
const MINIMUM_EVENT_RETENTION_DAYS = 7;
const MAXIMUM_EVENT_RETENTION_DAYS = 90;

export function securityEventRetentionDays(source: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = source.MVH_SECURITY_EVENT_RETENTION_DAYS?.trim() ?? "";
  if (!/^\d{1,3}$/.test(raw)) return DEFAULT_SECURITY_EVENT_RETENTION_DAYS;
  const parsed = Number(raw);
  return parsed >= MINIMUM_EVENT_RETENTION_DAYS && parsed <= MAXIMUM_EVENT_RETENTION_DAYS
    ? parsed
    : DEFAULT_SECURITY_EVENT_RETENTION_DAYS;
}
