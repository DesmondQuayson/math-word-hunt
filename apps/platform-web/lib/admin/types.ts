export type AdminUserRecord = Readonly<{
  id: string;
  user_id: string;
  role: "owner";
  mfa_enrolled: boolean;
  created_at: string;
  revoked_at: string | null;
}>;

export type AdminSessionEndReason = "signed-out" | "expired" | "idle-expired" | "emergency-revocation";

export type AdminSessionRecord = Readonly<{
  id: string;
  admin_user_id: string;
  token_hash: string;
  assurance_level: "aal2";
  started_at: string;
  expires_at: string;
  last_activity_at: string;
  step_up_at: string;
  ended_at: string | null;
  revoked_at: string | null;
  end_reason: AdminSessionEndReason | null;
}>;

export type AdminClientContext = Readonly<{
  ip: string | null;
  userAgent: string | null;
}>;

export type AdminMfaChallengeRecord = Readonly<{
  id: string;
  admin_user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
}>;

/**
 * Why an administrator has no usable admin session.
 * - missing: no well-formed session cookie (e.g. the browser dropped it at expiry)
 * - expired: past the absolute lifetime
 * - idle: no admin activity for the idle timeout
 * - ended: signed out, or already ended as expired/idle
 * - revoked: emergency revocation
 * - mismatch: the cookie belongs to another administrator's session
 */
export type AdminReauthReason = "missing" | "expired" | "idle" | "ended" | "revoked" | "mismatch";

export type AdminAccessDecision =
  | Readonly<{ state: "disabled" | "unavailable" | "unauthenticated" | "non-admin" | "mfa-required" }>
  | Readonly<{
    state: "reauth-required";
    reason: AdminReauthReason;
    /**
     * True only for a still-authorized administrator whose session ran out
     * (or whose browser lost it): they are sent to sign in again. Sign-out
     * replays, revocations and other administrators' sessions stay concealed.
     */
    recoverable: boolean;
  }>
  | Readonly<{ state: "authorized"; admin: AdminUserRecord; session: AdminSessionRecord }>;
