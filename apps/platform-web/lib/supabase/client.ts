"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "./public-config";

export function createBrowserSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Local teacher accounts are not configured.");
  return createBrowserClient(config.url, config.publishableKey);
}
