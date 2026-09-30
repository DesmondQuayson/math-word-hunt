/**
 * Super Admin session policy. Shared by the server (authority) and the browser
 * (the informational countdown). The database enforces the same numbers:
 * supabase/migrations/20260930100000_admin_two_hour_session.sql.
 *
 * - absolute: a session lasts at most ADMIN_SESSION_MAX_MINUTES from the MFA
 *   sign-in that started it. Activity never extends it.
 * - idle: a session ends after ADMIN_SESSION_IDLE_MINUTES without an
 *   authorized admin request. Activity is written at most once a minute.
 * - step-up: sensitive operations need a TOTP verification (the sign-in MFA
 *   counts) within the last ADMIN_STEP_UP_FRESH_MINUTES.
 */
export const ADMIN_SESSION_MIN_MINUTES = 5;
export const ADMIN_SESSION_DEFAULT_MINUTES = 15;
export const ADMIN_SESSION_MAX_MINUTES = 120;
export const ADMIN_SESSION_IDLE_MINUTES = 60;
export const ADMIN_ACTIVITY_WRITE_INTERVAL_SECONDS = 60;
export const ADMIN_STEP_UP_FRESH_MINUTES = 5;
export const ADMIN_SESSION_WARNING_MINUTES = 10;

/**
 * Operations that need a fresh TOTP step-up. The database enforces the same
 * lists independently: begin_admin_account_operation, set_platform_feature_flag
 * and run_platform_analytics_retention all refuse a stale step-up.
 */
export const STEP_UP_ACCOUNT_OPERATIONS: ReadonlySet<string> = new Set([
  "revoke-sessions", "suspend", "restore", "emergency-revoke",
  "grant-complimentary", "remove-complimentary",
  "submit-refund-review", "deny-refund-review",
  "open-portal", "cancel-at-period-end"
]);
export const STEP_UP_FEATURE_FLAGS: ReadonlySet<string> = new Set(["checkout-emergency-disabled", "admin-emergency-disabled"]);

const MINUTE = 60_000;

export type AdminSessionClock = Readonly<{
  expires_at: string;
  last_activity_at: string;
  step_up_at: string;
}>;

export type AdminSessionDeadline = Readonly<{
  absoluteExpiresAt: number;
  idleExpiresAt: number;
  /** The earlier of the two: when the session actually ends if nothing happens. */
  effectiveExpiresAt: number;
  endsBy: "absolute" | "idle";
}>;

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function adminSessionDeadline(session: AdminSessionClock): AdminSessionDeadline {
  const absoluteExpiresAt = time(session.expires_at);
  const idleExpiresAt = time(session.last_activity_at) + ADMIN_SESSION_IDLE_MINUTES * MINUTE;
  const endsBy = idleExpiresAt < absoluteExpiresAt ? "idle" : "absolute";
  return { absoluteExpiresAt, idleExpiresAt, effectiveExpiresAt: Math.min(absoluteExpiresAt, idleExpiresAt), endsBy };
}

export function isAdminSessionIdle(session: AdminSessionClock, now: Date): boolean {
  const idleExpiresAt = adminSessionDeadline(session).idleExpiresAt;
  return !Number.isFinite(idleExpiresAt) || idleExpiresAt <= now.getTime();
}

export function shouldRecordAdminActivity(session: AdminSessionClock, now: Date): boolean {
  const last = time(session.last_activity_at);
  return Number.isFinite(last) && now.getTime() - last >= ADMIN_ACTIVITY_WRITE_INTERVAL_SECONDS * 1000;
}

export function isAdminStepUpFresh(session: AdminSessionClock, now: Date): boolean {
  const stepUp = time(session.step_up_at);
  return Number.isFinite(stepUp) && now.getTime() - stepUp < ADMIN_STEP_UP_FRESH_MINUTES * MINUTE && stepUp <= now.getTime() + 30_000;
}

/**
 * Admin pages a signed-out administrator may be returned to after signing in
 * again. Anything else (another site, a protocol-relative URL, an API route,
 * the sign-in or MFA pages themselves) is refused.
 */
const RETURNABLE_ADMIN_PATH = /^\/admin(?:\/resources\/[0-9a-f-]{36}|\/games\/[0-9a-f-]{36}\/preview|\/map-prep)?$/;
const PLACEHOLDER_ORIGIN = "https://admin-return.invalid";

export function safeAdminNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return null;
  }
  let parsed: URL;
  try { parsed = new URL(value, PLACEHOLDER_ORIGIN); } catch { return null; }
  if (parsed.origin !== PLACEHOLDER_ORIGIN || !RETURNABLE_ADMIN_PATH.test(parsed.pathname)) return null;
  parsed.searchParams.delete("csrf");
  const search = parsed.searchParams.toString();
  if (search.length > 400) return null;
  return search ? `${parsed.pathname}?${search}` : parsed.pathname;
}
