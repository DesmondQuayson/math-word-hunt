// Global setup for the hosted Playwright configs (phase 5 and phase 6B).
//
// The Vercel protection-bypass secret goes through scripts/vercel-protection-bypass.mjs: one redirect-free request to
// the preview origin carries it in a header and asks Vercel for its host-only bypass cookie. The tests then start from
// a storage state that holds only that cookie, so the secret is never sent again, never sent to another origin (an
// earlier version set it as a context-wide extraHTTPHeaders entry, which every third-party request carried), and never
// reaches a URL, a trace or a report. The state file is removed when the run ends.
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "@playwright/test";

import { createProtectionBypass } from "./scripts/vercel-protection-bypass.mjs";

export const HOSTED_BYPASS_STATE = join(tmpdir(), "mathnexa-hosted-bypass-state.json");

export default async function globalSetup() {
  const protection = createProtectionBypass({
    origin: process.env.MVH_PREVIEW_URL ?? "",
    secret: (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim()
  });
  if (!protection.enabled) throw new Error("Hosted Playwright requires the owner-approved protection-bypass entry.");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await protection.install(context);
    await context.storageState({ path: HOSTED_BYPASS_STATE });
  } finally {
    await browser.close();
  }
  return async () => rmSync(HOSTED_BYPASS_STATE, { force: true });
}
