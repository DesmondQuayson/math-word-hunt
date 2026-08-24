import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

const maximumAttempts = 5;
const windowSeconds = 15 * 60;
const blockSeconds = 30 * 60;

function compact(value: string | null, maximum: number): string {
  return (value ?? "").trim().slice(0, maximum);
}

export function schoolAccessRateLimitSubject(secret: string, ip: string, userAgent: string): string {
  return createHmac("sha256", secret)
    .update(`school-access\n${compact(ip, 128)}\n${compact(userAgent, 512)}`)
    .digest("hex");
}

async function subject(secret: string): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = compact(requestHeaders.get("x-forwarded-for"), 256).split(",")[0]?.trim() ?? "";
  const ip = forwarded || compact(requestHeaders.get("x-real-ip"), 128) || "unavailable";
  const userAgent = compact(requestHeaders.get("user-agent"), 512) || "unavailable";
  return schoolAccessRateLimitSubject(secret, ip, userAgent);
}

export async function consumeSchoolAccessAttempt(secret: string): Promise<boolean> {
  const client = createServiceSupabaseClient();
  if (!client) return false;
  const result = await client.rpc("consume_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: await subject(secret),
    p_max_attempts: maximumAttempts,
    p_window_seconds: windowSeconds,
    p_block_seconds: blockSeconds
  });
  return !result.error && result.data === true;
}

export async function clearSchoolAccessAttempts(secret: string): Promise<void> {
  const client = createServiceSupabaseClient();
  if (!client) return;
  await client.rpc("clear_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: await subject(secret)
  });
}
