export type AdminUserRecord = Readonly<{
  id: string;
  user_id: string;
  role: "owner";
  mfa_enrolled: boolean;
  created_at: string;
  revoked_at: string | null;
}>;

export type AdminSessionRecord = Readonly<{
  id: string;
  admin_user_id: string;
  token_hash: string;
  assurance_level: "aal2";
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  revoked_at: string | null;
  end_reason: "signed-out" | "expired" | "emergency-revocation" | null;
}>;

export type AdminClientContext = Readonly<{
  ip: string | null;
  userAgent: string | null;
}>;

export type AdminAccessDecision =
  | Readonly<{ state: "disabled" | "unavailable" | "unauthenticated" | "non-admin" | "mfa-required" | "reauth-required" }>
  | Readonly<{ state: "authorized"; admin: AdminUserRecord; session: AdminSessionRecord }>;
