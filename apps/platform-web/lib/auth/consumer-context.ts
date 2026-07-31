import "server-only";

import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ConsumerAccountRecord = Readonly<{
  userId: string;
  accountStatus: "active" | "suspended" | "deletion-pending";
  emailConfirmedAt: string | null;
  trialRedeemedAt: string | null;
  deletionRequestedAt: string | null;
  deletionCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type ConsumerContext =
  | Readonly<{ status: "unconfigured" | "anonymous"; userId: null; email: null; account: null }>
  | Readonly<{ status: "unconfirmed" | "missing-account"; userId: string; email: string | null; account: null }>
  | Readonly<{
      status: "active" | "suspended" | "deletion-pending";
      userId: string;
      email: string | null;
      account: ConsumerAccountRecord;
    }>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value)) ? value : null;
}

export async function resolveConsumerContext(): Promise<ConsumerContext> {
  if (!isProductionPlatformMode()) return { status: "unconfigured", userId: null, email: null, account: null };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { status: "unconfigured", userId: null, email: null, account: null };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { status: "anonymous", userId: null, email: null, account: null };
  const user = userData.user;
  if (!user.email_confirmed_at) return { status: "unconfirmed", userId: user.id, email: user.email ?? null, account: null };

  const { data, error } = await supabase
    .from("consumer_accounts")
    .select("user_id, account_status, email_confirmed_at, trial_redeemed_at, deletion_requested_at, deletion_completed_at, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data || (data.account_status !== "active" && data.account_status !== "suspended" && data.account_status !== "deletion_pending")) {
    return { status: "missing-account", userId: user.id, email: user.email ?? null, account: null };
  }
  const account: ConsumerAccountRecord = Object.freeze({
    userId: data.user_id,
    accountStatus: data.account_status === "deletion_pending" ? "deletion-pending" : data.account_status,
    emailConfirmedAt: text(data.email_confirmed_at),
    trialRedeemedAt: text(data.trial_redeemed_at),
    deletionRequestedAt: text(data.deletion_requested_at),
    deletionCompletedAt: text(data.deletion_completed_at),
    createdAt: text(data.created_at) ?? String(data.created_at),
    updatedAt: text(data.updated_at) ?? String(data.updated_at)
  });
  return {
    status: account.accountStatus,
    userId: user.id,
    email: user.email ?? null,
    account
  };
}
