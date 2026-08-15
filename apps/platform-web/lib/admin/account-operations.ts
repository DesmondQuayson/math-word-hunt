import "server-only";

import type { User } from "@supabase/supabase-js";

import { createConsumerBillingProvider } from "@/lib/billing/consumer-provider-factory";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { createConsumerBillingRepository, createConsumerPortal } from "@/lib/billing/consumer-service";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Row = Record<string, unknown>;
export type AdminAccountView = Readonly<{
  id: string; email: string; status: string; confirmed: boolean; createdAt: string;
  lastAuthenticatedAt: string | null; trial: string; subscription: string; entitlement: string;
  consentVersions: string; deletion: string; complimentaryExpiresAt: string | null;
  notes: readonly Readonly<{ id: string; note: string; createdAt: string }>[];
  refunds: readonly Readonly<{ id: string; status: string; requestedAt: string }>[];
  audit: readonly Readonly<{ action: string; createdAt: string }>[];
}>;
export type AdminAccountsSnapshot = Readonly<{
  state: "ready" | "unavailable"; accounts: readonly AdminAccountView[]; truncated: boolean;
}>;

const str = (value: unknown): string => typeof value === "string" ? value : "";
const nullable = (value: unknown): string | null => typeof value === "string" && value ? value : null;

export async function loadAdminAccounts(): Promise<AdminAccountsSnapshot> {
  const client = createServiceSupabaseClient();
  if (!client) return { state: "unavailable", accounts: [], truncated: false };
  const [users, adminIdentities, accounts, entitlements, subscriptions, acceptances, deletions, notes, refunds, complimentary, audit] = await Promise.all([
    client.auth.admin.listUsers({ page: 1, perPage: 100 }),
    client.from("admin_users").select("user_id").is("revoked_at", null),
    client.from("consumer_accounts").select("user_id,account_status,email_confirmed_at,trial_redeemed_at,deletion_requested_at,created_at"),
    client.from("consumer_game_entitlements").select("user_id,entitlement_state,trial_ends_at,current_period_ends_at,grace_ends_at"),
    client.from("billing_subscriptions").select("owner_consumer_id,subscription_status,current_period_end,cancel_at_period_end,updated_at").not("owner_consumer_id", "is", null).order("updated_at", { ascending: false }),
    client.from("consumer_commercial_acceptances").select("owner_user_id,terms_version,privacy_version,cancellation_policy_version,refund_policy_version,accepted_at").order("accepted_at", { ascending: false }),
    client.from("consumer_account_deletion_requests").select("owner_user_id,request_status,requested_at").order("requested_at", { ascending: false }),
    client.from("admin_user_support_notes").select("id,target_user_id,note,created_at").order("created_at", { ascending: false }).limit(500),
    client.from("consumer_refund_requests").select("id,owner_user_id,request_status,requested_at").order("requested_at", { ascending: false }),
    client.from("consumer_complimentary_entitlements").select("owner_user_id,expires_at,revoked_at").is("revoked_at", null).gt("expires_at", new Date().toISOString()),
    client.from("admin_audit_log").select("target,action,created_at").like("action", "admin.account.%").order("created_at", { ascending: false }).limit(500)
  ]);
  const queryResults = [adminIdentities, accounts, entitlements, subscriptions, acceptances, deletions, notes, refunds, complimentary, audit];
  if (users.error || queryResults.some((result) => result.error)) return { state: "unavailable", accounts: [], truncated: false };
  const authById = new Map(users.data.users.map((user: User) => [user.id, user]));
  const protectedAdminIds = new Set((adminIdentities.data ?? []).map((row) => row.user_id));
  const accountRows = (accounts.data ?? []) as Row[];
  const mapped = accountRows.map((account): AdminAccountView | null => {
    const id = str(account.user_id); const user = authById.get(id); if (!user || protectedAdminIds.has(id)) return null;
    const entitlement = ((entitlements.data ?? []) as Row[]).find((row) => row.user_id === id);
    const subscription = ((subscriptions.data ?? []) as Row[]).find((row) => row.owner_consumer_id === id);
    const acceptance = ((acceptances.data ?? []) as Row[]).find((row) => row.owner_user_id === id);
    const deletion = ((deletions.data ?? []) as Row[]).find((row) => row.owner_user_id === id);
    const comp = ((complimentary.data ?? []) as Row[]).find((row) => row.owner_user_id === id);
    const consentVersions = acceptance
      ? `terms ${str(acceptance.terms_version)} · privacy ${str(acceptance.privacy_version)} · cancellation ${str(acceptance.cancellation_policy_version)} · refunds ${str(acceptance.refund_policy_version)}`
      : "none recorded";
    const compExpiry = nullable(comp?.expires_at);
    return Object.freeze({
      id, email: user.email ?? "Email unavailable", status: str(account.account_status),
      confirmed: Boolean(user.email_confirmed_at && account.email_confirmed_at), createdAt: str(account.created_at),
      lastAuthenticatedAt: user.last_sign_in_at ?? null,
      trial: account.trial_redeemed_at ? (str(entitlement?.entitlement_state).startsWith("trial-") ? str(entitlement?.entitlement_state) : "redeemed") : "not redeemed",
      subscription: subscription ? `${str(subscription.subscription_status)}${subscription.cancel_at_period_end ? " · cancels at period end" : ""}` : "none",
      entitlement: compExpiry ? "complimentary" : str(entitlement?.entitlement_state) || "no-entitlement",
      consentVersions, deletion: deletion ? `${str(deletion.request_status)} · ${str(deletion.requested_at)}` : "none",
      complimentaryExpiresAt: compExpiry,
      notes: ((notes.data ?? []) as Row[]).filter((row) => row.target_user_id === id).map((row) => ({ id: str(row.id), note: str(row.note), createdAt: str(row.created_at) })),
      refunds: ((refunds.data ?? []) as Row[]).filter((row) => row.owner_user_id === id).map((row) => ({ id: str(row.id), status: str(row.request_status), requestedAt: str(row.requested_at) })),
      audit: ((audit.data ?? []) as Row[]).filter((row) => row.target === id).map((row) => ({ action: str(row.action), createdAt: str(row.created_at) }))
    });
  }).filter((account): account is AdminAccountView => account !== null);
  return { state: "ready", accounts: mapped, truncated: users.data.total > users.data.users.length };
}

export async function createAdminPortalForTarget(targetUserId: string) {
  const config = tryGetConsumerBillingConfiguration();
  const client = createServiceSupabaseClient();
  if (!config || !client || !config.portalEnabled) throw new Error("portal-unavailable");
  const [auth, account] = await Promise.all([
    client.auth.admin.getUserById(targetUserId),
    client.from("consumer_accounts").select("user_id,account_status,email_confirmed_at,trial_redeemed_at,deletion_requested_at,deletion_completed_at,created_at,updated_at").eq("user_id", targetUserId).maybeSingle()
  ]);
  if (auth.error || !auth.data.user || account.error || !account.data) throw new Error("account-unavailable");
  const row = account.data;
  const status = row.account_status === "deletion_pending" ? "deletion-pending" : row.account_status;
  if (status !== "active" && status !== "deletion-pending") throw new Error("account-restricted");
  const repository = createConsumerBillingRepository(config); if (!repository) throw new Error("portal-unavailable");
  return createConsumerPortal({
    context: { status, userId: targetUserId, email: auth.data.user.email ?? null, account: {
      userId: targetUserId, accountStatus: status, emailConfirmedAt: row.email_confirmed_at,
      trialRedeemedAt: row.trial_redeemed_at, deletionRequestedAt: row.deletion_requested_at,
      deletionCompletedAt: row.deletion_completed_at, createdAt: row.created_at, updatedAt: row.updated_at
    } },
    config, provider: createConsumerBillingProvider(config), repository
  });
}
