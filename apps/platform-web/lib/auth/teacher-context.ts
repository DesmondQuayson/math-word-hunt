import "server-only";

import {
  parseTeacherProfile,
  parseUserId,
  type TeacherProfileRecord,
  type UserId
} from "@math-vocabulary-hunt/platform-core";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeTimestamp } from "@/lib/repositories/errors";

type BaseContext = Readonly<{ configured: boolean }>;
export type TeacherContext =
  | (BaseContext & Readonly<{ status: "unconfigured" | "anonymous"; userId: null; email: null; profile: null }>)
  | (BaseContext & Readonly<{ status: "missing-profile"; userId: UserId; email: string | null; profile: null }>)
  | (BaseContext & Readonly<{
      status: "active" | "suspended" | "deletion-requested";
      userId: UserId;
      email: string | null;
      profile: TeacherProfileRecord;
    }>);

export async function resolveTeacherContext(): Promise<TeacherContext> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { configured: false, status: "unconfigured", userId: null, email: null, profile: null };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { configured: true, status: "anonymous", userId: null, email: null, profile: null };
  }

  const userId = parseUserId(userData.user.id);
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("user_id, display_name, school_or_organization_label, account_status, created_at, updated_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error || !data || typeof data !== "object") {
    return { configured: true, status: "missing-profile", userId, email: userData.user.email ?? null, profile: null };
  }

  const row = data as Record<string, unknown>;
  const parsed = parseTeacherProfile({
    teacherId: row.user_id,
    displayName: row.display_name,
    organizationLabel: row.school_or_organization_label,
    accountStatus: row.account_status === "deletion_requested" ? "deletion-requested" : row.account_status,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  });
  if (!parsed.ok || parsed.value.accountStatus === "closed") {
    return { configured: true, status: "missing-profile", userId, email: userData.user.email ?? null, profile: null };
  }

  return {
    configured: true,
    status: parsed.value.accountStatus,
    userId,
    email: userData.user.email ?? null,
    profile: parsed.value
  };
}
