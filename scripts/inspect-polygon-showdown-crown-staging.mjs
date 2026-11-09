/**
 * Polygon Showdown — looks at the crown on the HOSTED build. Signs in as one
 * synthetic staging account (deleted afterwards), tries on Polygon Crown with
 * twin buns in the real Shop, photographs the avatar from eight sides, and
 * captures a lobby QR code. Launched by scripts/invoke-polygon-showdown-staging.ps1 -Stage crown
 * -Origin <preview URL> -Out <folder>. Writes PNGs; prints nothing secret.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { sessionCookies } from "./polygon-showdown-staging-session.mjs";
import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
for (const name of Object.keys(process.env)) if (/_LIVE_|_PRODUCTION_|_READONLY_/.test(name)) throw new Error(`refusing: ${name} is present in this process`);
const out = process.env.INSPECT_OUT;
if (!out) throw new Error("INSPECT_OUT is required");
mkdirSync(out, { recursive: true });

const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const supabaseUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protection = createProtectionBypass({ origin, secret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "" });
const email = `polygon-crown-${randomBytes(4).toString("hex")}@example.invalid`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (made.error || !made.data.user) throw new Error("synthetic-user-failed");

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let roomCode = null;
try {
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await protection.install(context);
  const { cookies } = await sessionCookies(supabaseUrl, secretKey, email, password);
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: origin, sameSite: "Lax" })));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/games/polygon-showdown/play#shop");
  await page.waitForFunction(() => window.__POLYGON_SHOWDOWN__?.shop?.avatarView?.debug() != null, null, { timeout: 90_000 });
  const tryOn = async (tab, item) => {
    await page.locator(`.tab[data-tab="${tab}"]`).click();
    await page.locator(`.product-card[data-item="${item}"]`).click();
    await page.waitForTimeout(700);
    await page.locator("#detail-try").click();
    await page.waitForTimeout(900);
  };
  await tryOn("hats", "hat-polygon-crown");
  for (const hair of ["hair-twin-buns"]) {
    await tryOn("hair", hair);
    await page.locator("#detail-close").click().catch(() => null);
    await page.waitForTimeout(400);
    const frame = page.locator("#stage-frame");
    for (let angle = 0; angle < 8; angle += 1) {
      await page.locator("#rotate-right").click();
      await page.waitForTimeout(450);
      await frame.screenshot({ path: join(out, `${hair}-${angle}.png`) });
    }
  }
  // The lobby's QR code, as a phone's camera would see it.
  await page.goto("/games/polygon-showdown/play#create");
  await page.waitForFunction(() => document.body.dataset.screen === "create", null, { timeout: 60_000 });
  await page.locator('[data-minutes="5"]').click();
  await page.locator('[data-difficulty="standard"]').click();
  await page.locator("#creator-name").fill("Inspector");
  await page.locator("#create-game").click();
  await page.waitForFunction(() => document.body.dataset.screen === "lobby", null, { timeout: 60_000 });
  roomCode = (await page.locator("#join-code").textContent()).trim();
  await page.locator(".qr-code").screenshot({ path: join(out, "qr.png"), scale: "css" });
  console.log(JSON.stringify({ deployment: origin, shots: 8, roomCode, expectedQr: `${origin}/join?code=${roomCode}`, pageErrors: errors }));
} finally {
  await browser.close();
  if (roomCode) await admin.from("polygon_rooms").delete().eq("code", roomCode);
  await admin.auth.admin.deleteUser(made.data.user.id);
}
