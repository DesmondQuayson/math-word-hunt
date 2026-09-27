/**
 * Verifies a Vercel Shareable Link for the Math Tug of War STAGING preview
 * from clean browsers: no Vercel login, no protection-bypass header or cookie.
 * Launched by scripts/invoke-math-tug-of-war-staging.ps1 -Stage share-check
 * -Origin <share URL>; only the staging Supabase secret key is loaded (for one
 * synthetic subscriber, deleted at the end). The share token is never printed.
 */
import { randomBytes } from "node:crypto";

import { chromium, devices, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const share = new URL((process.env.SHARE_URL ?? "").trim());
if (!/^mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(share.hostname)) throw new Error("SHARE_URL must be a staging preview URL");
const token = share.searchParams.get("_vercel_share") ?? "";
if (!/^[A-Za-z0-9]{20,}$/.test(token)) throw new Error("SHARE_URL must carry _vercel_share");
const origin = share.origin;
const redact = (text) => String(text).split(token).join("[share]");
const admin = createClient("https://gcmuhzxkwvfireyrearl.supabase.co", process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const password = `${randomBytes(12).toString("base64url")}Aa1!`;
const email = `tug-share-${randomBytes(3).toString("hex")}@example.invalid`;
const results = [];
const ok = (condition, message) => { results.push(Boolean(condition)); console.log(`${condition ? "ok  " : "FAIL"} ${redact(message)}`); };
let userId = null;

async function clean(engine, device) {
  const context = await engine.newContext({ ...device });
  const page = await context.newPage();
  const hosts = new Set();
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) hosts.add(new URL(frame.url()).hostname); });
  const response = await page.goto(share.href, { waitUntil: "domcontentloaded" });
  return { context, page, hosts, status: response?.status() ?? 0 };
}

try {
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { purpose: "math-tug-of-war-share-check" } });
  if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  userId = made.data.user.id;
  const now = Date.now();
  await admin.from("consumer_accounts").update({ trial_redeemed_at: new Date(now).toISOString() }).eq("user_id", userId);
  const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: userId, entitlement_state: "subscription-active", current_period_ends_at: new Date(now + 5 * 86_400_000).toISOString() });
  if (entitlement.error) throw new Error("synthetic-entitlement-failed");

  for (const [label, engine, device] of [["desktop Chromium", chromium, devices["Desktop Chrome"]], ["iPhone (WebKit)", webkit, devices["iPhone 13"]], ["Android phone (Chromium)", chromium, devices["Pixel 7"]], ["iPad (WebKit)", webkit, devices["iPad (gen 7)"]], ["Smart Board 1920x1080 (Chromium)", chromium, { viewport: { width: 1920, height: 1080 } }]]) {
    const browser = await engine.launch();
    try {
      // Control: the bare preview URL without the share link must still be protected.
      if (label === "desktop Chromium") {
        const control = await browser.newContext();
        const controlPage = await control.newPage();
        await controlPage.goto(`${origin}/games`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
        const controlHost = new URL(controlPage.url()).hostname;
        ok(controlHost.endsWith("vercel.com"), `control: bare preview URL still requires Vercel login (lands on ${controlHost})`);
        await control.close();
      }
      const { context, page, hosts, status } = await clean(browser, device);
      ok(![...hosts].some((host) => host.endsWith("vercel.com")), `${label}: share link never visits vercel.com (status ${status})`);
      ok(new URL(page.url()).hostname === share.hostname, `${label}: MathNexa loads on the staging preview`);
      await page.goto(`${origin}/games`, { waitUntil: "domcontentloaded" });
      ok(!new URL(page.url()).hostname.endsWith("vercel.com"), `${label}: /games reached without Vercel login (MathNexa ${new URL(page.url()).pathname})`);
      await page.goto(`${origin}/sign-in?next=${encodeURIComponent("/games")}`, { waitUntil: "domcontentloaded" });
      await page.getByLabel("Email address").fill(email);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 45_000 });
      await page.goto(`${origin}/games`, { waitUntil: "domcontentloaded" });
      const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Math Tug of War", exact: true }) });
      ok(await card.count() === 1, `${label}: Math Tug of War card on /games`);
      await card.getByRole("link", { name: "Play" }).click();
      await page.getByRole("heading", { level: 1, name: /Math Tug of War/ }).waitFor({ timeout: 45_000 });
      ok(new URL(page.url()).pathname === "/games/math-tug-of-war/play", `${label}: Math Tug of War launches`);
      await page.click("button[data-mode=teams]");
      await page.click(".setup-form button[type=submit]");
      await page.locator(".team-panel.team-turquoise .question-text").waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(overflow <= 0, `${label}: gameplay renders, no horizontal overflow`);
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
  const passed = results.filter(Boolean).length;
  console.log(`\nSHARE-CHECK ${passed}/${results.length} passed; synthetic subscriber deleted: ${Boolean(userId)}`);
  if (passed !== results.length || results.length === 0) process.exitCode = 1;
}
