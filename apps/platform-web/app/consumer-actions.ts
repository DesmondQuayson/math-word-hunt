"use server";

import { redirect } from "next/navigation";

import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requestConsumerDeletionAction(): Promise<void> {
  if (!isProductionPlatformMode()) redirect("/not-launched");
  const context = await resolveConsumerContext();
  if (context.status !== "active") redirect("/account?deletion=unavailable");
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/account?deletion=unavailable");
  const { error } = await supabase.rpc("request_own_consumer_account_deletion");
  redirect(error ? "/account?deletion=unavailable" : "/account?deletion=requested");
}

export async function requestConsumerRefundReviewAction(): Promise<void> {
  if (!isProductionPlatformMode()) redirect("/not-launched");
  const context = await resolveConsumerContext();
  if (context.status !== "active" && context.status !== "deletion-pending") {
    redirect("/refunds?refund=unavailable");
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/refunds?refund=unavailable");
  const { error } = await supabase.rpc("request_own_consumer_refund_review");
  redirect(error ? "/refunds?refund=unavailable" : "/refunds?refund=requested");
}
