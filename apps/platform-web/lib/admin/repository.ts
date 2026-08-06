import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

import type { AdminClientContext, AdminMfaChallengeRecord, AdminSessionRecord, AdminUserRecord } from "./types";

export type AdminAuditEvent = Readonly<{
  adminUserId: string | null;
  action: string;
  target?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
  context: AdminClientContext;
}>;

export class AdminRepository {
  constructor(private readonly client: NonNullable<ReturnType<typeof createServiceSupabaseClient>>) {}

  async findAdminByUserId(userId: string): Promise<AdminUserRecord | null> {
    const result = await this.client.from("admin_users")
      .select("id,user_id,role,mfa_enrolled,created_at,revoked_at")
      .eq("user_id", userId).maybeSingle();
    if (result.error) throw new Error("Admin identity lookup failed.");
    return result.data as AdminUserRecord | null;
  }

  async findSessionByHash(tokenHash: string): Promise<AdminSessionRecord | null> {
    const result = await this.client.from("admin_sessions")
      .select("id,admin_user_id,token_hash,assurance_level,started_at,expires_at,ended_at,revoked_at,end_reason")
      .eq("token_hash", tokenHash).maybeSingle();
    if (result.error) throw new Error("Admin session lookup failed.");
    return result.data as AdminSessionRecord | null;
  }

  async startMfaChallenge(adminUserId: string, tokenHash: string, expiresAt: Date, context: AdminClientContext): Promise<void> {
    const created = await this.client.rpc("start_admin_mfa_challenge", {
      p_admin_user_id: adminUserId, p_token_hash: tokenHash, p_expires_at: expiresAt.toISOString(),
      p_ip: context.ip, p_user_agent: context.userAgent
    });
    if (created.error || typeof created.data !== "string") throw new Error("Admin MFA challenge creation failed.");
  }

  async findMfaChallengeByHash(tokenHash: string): Promise<AdminMfaChallengeRecord | null> {
    const result = await this.client.from("admin_mfa_challenges")
      .select("id,admin_user_id,token_hash,created_at,expires_at,consumed_at,revoked_at")
      .eq("token_hash", tokenHash).maybeSingle();
    if (result.error) throw new Error("Admin MFA challenge lookup failed.");
    return result.data as AdminMfaChallengeRecord | null;
  }

  async consumeMfaChallenge(tokenHash: string, now = new Date()): Promise<boolean> {
    void now;
    const result = await this.client.rpc("consume_admin_mfa_challenge", { p_token_hash: tokenHash });
    if (result.error || typeof result.data !== "boolean") throw new Error("Admin MFA challenge consumption failed.");
    return result.data;
  }

  async recordAudit(event: AdminAuditEvent): Promise<void> {
    const result = await this.client.rpc("record_admin_audit_event", {
      p_admin_user_id: event.adminUserId,
      p_action: event.action,
      p_target: event.target ?? null,
      p_metadata: event.metadata ?? {},
      p_ip: event.context.ip,
      p_user_agent: event.context.userAgent
    });
    if (result.error) throw new Error("Admin audit write failed.");
  }

  async consumeRateLimit(
    scope: "login" | "mfa",
    subjectHash: string,
    maximum: number,
    windowSeconds: number,
    blockSeconds: number
  ): Promise<boolean> {
    const result = await this.client.rpc("consume_admin_auth_rate_limit", {
      p_scope: scope,
      p_subject_hash: subjectHash,
      p_max_attempts: maximum,
      p_window_seconds: windowSeconds,
      p_block_seconds: blockSeconds
    });
    if (result.error || typeof result.data !== "boolean") throw new Error("Admin rate limit unavailable.");
    return result.data;
  }

  async clearRateLimit(scope: "login" | "mfa", subjectHash: string): Promise<void> {
    const result = await this.client.rpc("clear_admin_auth_rate_limit", {
      p_scope: scope,
      p_subject_hash: subjectHash
    });
    if (result.error) throw new Error("Admin rate limit reset failed.");
  }

  async markMfaEnrolled(adminUserId: string): Promise<void> {
    const result = await this.client.rpc("mark_admin_mfa_enrolled", { p_admin_user_id: adminUserId });
    if (result.error) throw new Error("Admin MFA state update failed.");
  }

  async startSession(
    adminUserId: string,
    tokenHash: string,
    expiresAt: Date,
    context: AdminClientContext
  ): Promise<string> {
    const result = await this.client.rpc("start_admin_session", {
      p_admin_user_id: adminUserId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt.toISOString(),
      p_ip: context.ip,
      p_user_agent: context.userAgent
    });
    if (result.error || typeof result.data !== "string") throw new Error("Admin session creation failed.");
    return result.data;
  }

  async endSession(tokenHash: string, reason: "signed-out" | "expired", context: AdminClientContext): Promise<void> {
    const result = await this.client.rpc("end_admin_session", {
      p_token_hash: tokenHash,
      p_reason: reason,
      p_ip: context.ip,
      p_user_agent: context.userAgent
    });
    if (result.error) throw new Error("Admin session invalidation failed.");
  }
}

export function createAdminRepository(): AdminRepository | null {
  const client = createServiceSupabaseClient();
  return client ? new AdminRepository(client) : null;
}
