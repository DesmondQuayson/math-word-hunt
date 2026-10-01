// Phase 8E public package delivery, in Chromium AND WebKit (playwright.phase8e.config.mjs).
// The package runs in <iframe sandbox="allow-scripts"> (an opaque origin). Chromium sends no SameSite=Lax cookie
// on that frame's sub-resource requests, so the package's CSS and JS authenticate with the signed 300-second
// ticket, and the server re-decides the ticket principal's access on every asset (lib/games/ticket.ts).
import { createHmac, randomUUID } from "node:crypto";

import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const key = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const delivery = process.env.MVH_GAME_DELIVERY_SECRET ?? "";
const schoolCode = process.env.MATHNEXA_SCHOOL_ACCESS_CODE ?? "";
const schoolSecret = process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET ?? "";
const base = "http://127.0.0.1:3000";
const password = "SyntheticAdult42!";
let admin: SupabaseClient;
let anon: APIRequestContext;
let packageId = "";
let resourceId = "";
let entryFile = "";
const users: Record<"A" | "B" | "C" | "D" | "E", User> = {} as never;

test.describe.configure({ mode: "serial" });

const nowS = () => Math.floor(Date.now() / 1000);
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = (ticket: string) => JSON.parse(Buffer.from(ticket.split(".")[0]!, "base64url").toString("utf8"));
const schoolKey = () => createHmac("sha256", delivery).update(`mathnexa-game-ticket:school-access:v1:${schoolSecret}`).digest("base64url");
function mint({ aud = "subscriber", packageId: pkg = packageId, principalId, issuedAt = nowS(), lifetime = 300, key: signingKey = delivery, extra = {} }: { aud?: string; packageId?: string; principalId: string; issuedAt?: number; lifetime?: number; key?: string; extra?: Record<string, unknown> }) {
  const encoded = b64({ v: 1, aud, packageId: pkg, principalId, issuedAt, expiresAt: issuedAt + lifetime, ...extra });
  return `${encoded}.${createHmac("sha256", signingKey).update(encoded).digest("base64url")}`;
}
/** Changes one character in the middle of the MAC (never the last one, whose low bits may be padding). */
function flip(ticket: string) {
  const [payload, signature] = ticket.split(".") as [string, string];
  return `${payload}.${signature.slice(0, 10)}${signature[10] === "A" ? "B" : "A"}${signature.slice(11)}`;
}
const asset = (slug: string, ticket: string, file: string) => `/games/${slug}/runtime/assets/${ticket}/${file}`;
function schoolCookie(sid: string, exp: number) {
  const encoded = b64({ v: 1, sid, iat: exp - 43200, exp });
  return `${encoded}.${createHmac("sha256", schoolSecret).update(encoded).digest("base64url")}`;
}

async function createUser(role: string, project: string, entitled: boolean): Promise<User> {
  const created = await admin.auth.admin.createUser({ email: `phase8e-${role}-${project}-${nowS()}@example.test`, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error(`user ${role} unavailable`);
  if (entitled) {
    const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: created.data.user.id, entitlement_state: "subscription-active", current_period_ends_at: new Date(Date.now() + 86_400_000).toISOString() });
    if (entitlement.error) throw entitlement.error;
  }
  return created.data.user;
}
async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // b13ce5e: a completed sign-in lands on Home.
  await expect(page).toHaveURL("/");
}
async function signedIn(browser: Browser, user: User): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  await signIn(page, user.email!);
  return { context, page };
}
/** Opens the package game and returns its frame, slug and ticket. */
async function openGame(page: Page): Promise<{ iframe: Locator; slug: string; ticket: string }> {
  await page.goto(`/games/${resourceId}`);
  const iframe = page.locator('[data-testid="package-game-frame"]');
  await expect(iframe).toBeVisible();
  const src = new URL((await iframe.getAttribute("src")) ?? "", base);
  const match = /^\/games\/([a-z0-9-]+)\/runtime$/.exec(src.pathname);
  expect(match, "the frame launches through the package runtime route").not.toBeNull();
  return { iframe, slug: match![1]!, ticket: src.searchParams.get("ticket") ?? "" };
}
/** Records every package asset request and its response status. */
function track(page: Page) {
  const statuses = new Map<string, number>();
  const requests: import("@playwright/test").Request[] = [];
  page.on("request", (request) => { if (request.url().includes("/runtime/assets/")) requests.push(request); });
  page.on("response", (response) => {
    if (!response.url().includes("/runtime/assets/")) return;
    statuses.set(new URL(response.url()).pathname.split("/").slice(-2).join("/"), response.status());
  });
  return { statuses, requests };
}
/** The package's HTML, CSS and JS all load inside the script-only sandbox. */
async function expectPackageFrame(page: Page, iframe: Locator, tracked: ReturnType<typeof track>, testInfo: TestInfo) {
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  const frame = page.frameLocator('[data-testid="package-game-frame"]');
  await expect(frame.getByRole("heading", { name: "Fraction Field" })).toBeVisible();
  await expect(frame.locator("body")).toHaveCSS("color", "rgb(16, 42, 67)");
  await expect(frame.getByRole("button", { name: "Show answer" })).toHaveCSS("min-height", "44px");
  await frame.getByRole("button", { name: "Show answer" }).click();
  await expect(frame.getByText("Equivalent fractions match")).toBeVisible();
  await expect.poll(() => Object.fromEntries(tracked.statuses)).toEqual({ "game/index.html": 200, "game/styles.css": 200, "game/main.js": 200 });
  if (testInfo.project.name === "chromium") {
    // The regression this fixes: the sandboxed frame's sub-resources carry no cookie in Chromium.
    const subResources = tracked.requests.filter((item) => /\/game\/(?:styles\.css|main\.js)$/.test(item.url()));
    // Both sub-resources were requested (a re-rendered frame may request them again); every request is checked below.
    expect([...new Set(subResources.map((item) => new URL(item.url()).pathname.split("/").pop()))].sort()).toEqual(["main.js", "styles.css"]);
    for (const request of subResources) {
      expect((await request.allHeaders()).cookie ?? "", request.url()).toBe("");
    }
  }
  const live = page.frames().find((item) => item.url().includes("/runtime/assets/"));
  expect(live, "the package frame is live").toBeTruthy();
  expect(await live!.evaluate(() => self.origin)).toBe("null");
  expect(["blocked", ""]).toContain(await live!.evaluate(() => { try { return document.cookie; } catch { return "blocked"; } }));
}

test.beforeAll(async ({}, testInfo) => {
  expect(url).toBe("http://127.0.0.1:55321");
  expect(delivery).toBe("phase8e-local-game-delivery-secret-value");
  expect(schoolCode).toBe("PHASE8E-SCHOOL");
  expect(schoolSecret).toBe("phase8e-local-school-access-session-secret-value");
  admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  anon = await playwrightRequest.newContext({ baseURL: base });
  const project = testInfo.project.name;
  users.A = await createUser("a", project, true);
  users.B = await createUser("b", project, true);
  users.C = await createUser("c", project, false);
  users.D = await createUser("d", project, true);
  users.E = await createUser("e", project, true);
  const game = await admin.from("game_packages").select("id,resource_id,entry_file").eq("game_id", "phase8e-fraction-field").eq("publication_state", "published").single();
  if (game.error) throw game.error;
  packageId = game.data.id;
  resourceId = game.data.resource_id;
  entryFile = game.data.entry_file;
});
test.afterAll(async () => { await anon?.dispose(); });

test("entitled subscriber: package HTML, CSS and JS load inside the script-only sandbox", async ({ browser }, testInfo) => {
  expect((await anon.get(`/games/${resourceId}/runtime`)).status()).toBe(404);
  expect((await anon.get(`/games/${resourceId}/runtime/${entryFile}`)).status()).toBe(404);
  const { context, page } = await signedIn(browser, users.A);
  const tracked = track(page);
  const { iframe, ticket } = await openGame(page);
  await expectPackageFrame(page, iframe, tracked, testInfo);

  const source = (await iframe.getAttribute("src"))!;
  const html = await page.request.get(source, { headers: { "Sec-Fetch-Dest": "iframe" } });
  expect(html.status()).toBe(200);
  const csp = html.headers()["content-security-policy"];
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("script-src http://127.0.0.1:3000/games/");
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(html.headers()["permissions-policy"]).toContain("clipboard-read=()");
  expect((await admin.from("game_launch_events").select("id", { count: "exact", head: true }).eq("package_id", packageId).eq("consumer_user_id", users.A.id)).count).toBeGreaterThan(0);

  const payload = decode(ticket);
  expect(Object.keys(payload).sort()).toEqual(["aud", "expiresAt", "issuedAt", "packageId", "principalId", "v"]);
  expect(payload).toMatchObject({ v: 1, aud: "subscriber", packageId, principalId: users.A.id });
  expect(payload.expiresAt - payload.issuedAt).toBe(300);
  expect(JSON.stringify(payload)).not.toMatch(/@|cus_|sub_|sb-/);
  await context.close();
});

test("launch needs the cookie session; package sub-assets accept the signed ticket alone", async ({ browser }) => {
  const { context, page } = await signedIn(browser, users.A);
  const { slug, ticket } = await openGame(page);
  expect((await anon.get(`/games/${slug}/runtime?ticket=${encodeURIComponent(ticket)}`, { maxRedirects: 0 })).status()).toBe(404);
  const css = await anon.get(asset(slug, ticket, "game/styles.css"));
  expect(css.status()).toBe(200);
  expect(css.headers()["content-type"]).toContain("css");
  const js = await anon.get(asset(slug, ticket, "game/main.js"));
  expect(js.status()).toBe(200);
  expect(js.headers()["content-type"]).toContain("javascript");
  expect((await anon.get(asset(slug, ticket, entryFile), { headers: { "Sec-Fetch-Dest": "iframe" } })).status()).toBe(200);
  expect((await anon.get(asset(slug, ticket, entryFile))).status()).toBe(404);
  await context.close();
});

test("unauthenticated and unentitled principals are refused", async ({ browser }) => {
  const visitor = await browser.newContext({ baseURL: base });
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/games/${resourceId}`);
  await expect(visitorPage).toHaveURL(/\/access\?next=\/games$/);
  await expect(visitorPage.locator('[data-testid="package-game-frame"]')).toHaveCount(0);
  await visitor.close();

  const { context: reader, page: readerPage } = await signedIn(browser, users.A);
  const { slug } = await openGame(readerPage);
  await reader.close();
  expect((await anon.get(asset(slug, "x.y", "game/styles.css"))).status()).toBe(404);
  expect((await anon.get(asset(slug, mint({ principalId: randomUUID() }), "game/styles.css"))).status()).toBe(404);

  const { context, page } = await signedIn(browser, users.C);
  await page.goto(`/games/${resourceId}`);
  await expect(page.locator('[data-testid="package-game-frame"]')).toHaveCount(0);
  const unentitled = mint({ principalId: users.C.id });
  expect((await anon.get(asset(slug, unentitled, "game/styles.css"))).status()).toBe(404);
  expect((await page.request.get(asset(slug, unentitled, "game/styles.css"))).status()).toBe(404);
  expect((await page.request.get(`/games/${slug}/runtime?ticket=${encodeURIComponent(unentitled)}`, { maxRedirects: 0 })).status()).toBe(404);
  await context.close();
});

test("expired, wrong-lifetime, future-dated, forged and wrong-audience tickets are refused", async ({ browser }) => {
  const { context, page } = await signedIn(browser, users.A);
  const { slug, ticket } = await openGame(page);
  await context.close();
  const css = (value: string) => anon.get(asset(slug, value, "game/styles.css"));
  expect((await css(mint({ principalId: users.A.id }))).status(), "a re-minted valid ticket (the format is reproduced)").toBe(200);
  expect((await css(mint({ principalId: users.A.id, issuedAt: nowS() - 240 }))).status(), "still inside 300 s").toBe(200);
  const [payloadPart, realMac] = ticket.split(".") as [string, string];
  const swapped = `${b64({ ...decode(ticket), principalId: users.B.id })}.${realMac}`;
  const refused: Array<[string, string]> = [
    ["expired", mint({ principalId: users.A.id, issuedAt: nowS() - 301 })],
    ["long expired", mint({ principalId: users.A.id, issuedAt: nowS() - 400 })],
    ["lifetime 299", mint({ principalId: users.A.id, lifetime: 299 })],
    ["lifetime 301", mint({ principalId: users.A.id, lifetime: 301 })],
    ["future-dated", mint({ principalId: users.A.id, issuedAt: nowS() + 60 })],
    ["flipped MAC", flip(ticket)],
    ["wrong key", mint({ principalId: users.A.id, key: "x".repeat(40) })],
    ["payload swapped to another principal", swapped],
    ["admin-preview audience", mint({ aud: "admin-preview", principalId: users.A.id })],
    ["extra claim", mint({ principalId: users.A.id, extra: { email: users.A.email } })],
    ["MAC from another payload", `${payloadPart}.${mint({ principalId: users.B.id }).split(".")[1]}`]
  ];
  for (const [label, value] of refused) expect((await css(value)).status(), label).toBe(404);
});

test("principal mismatch is refused with and without a session", async ({ browser }) => {
  const a = await signedIn(browser, users.A);
  const { slug, ticket } = await openGame(a.page);
  const b = await signedIn(browser, users.B);
  expect((await b.page.request.get(asset(slug, ticket, "game/styles.css"))).status(), "B's session with A's ticket").toBe(404);
  expect((await anon.get(asset(slug, ticket, "game/styles.css"))).status(), "the same ticket without a session").toBe(200);
  expect((await b.page.request.get(`/games/${slug}/runtime?ticket=${encodeURIComponent(ticket)}`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await a.page.request.get(`/games/${slug}/runtime?ticket=${encodeURIComponent(ticket)}`, { maxRedirects: 0 })).status()).toBe(307);
  await a.context.close();
  await b.context.close();
});

test("package mismatch is refused", async ({ browser }) => {
  const { context, page } = await signedIn(browser, users.A);
  const { slug, ticket } = await openGame(page);
  await context.close();
  expect((await anon.get(asset(slug, mint({ principalId: users.A.id }), "game/styles.css"))).status()).toBe(200);
  expect((await anon.get(asset(slug, mint({ principalId: users.A.id, packageId: randomUUID() }), "game/styles.css"))).status()).toBe(404);
  expect((await anon.get(asset("phase8e-missing-game", ticket, "game/styles.css"))).status()).toBe(404);
});

test("entitlement revoked after the ticket was minted fails closed", async ({ browser }) => {
  const d = await signedIn(browser, users.D);
  const { slug, ticket } = await openGame(d.page);
  expect((await anon.get(asset(slug, ticket, "game/styles.css"))).status()).toBe(200);
  expect((await d.page.request.get(asset(slug, ticket, "game/styles.css"))).status()).toBe(200);
  const revoked = await admin.from("consumer_game_entitlements").update({ entitlement_state: "subscription-expired", current_period_ends_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", users.D.id);
  if (revoked.error) throw revoked.error;
  expect(nowS(), "still inside the ticket's 300 s").toBeLessThan(decode(ticket).expiresAt);
  expect((await anon.get(asset(slug, ticket, "game/styles.css"))).status(), "cookie-less, after revocation").toBe(404);
  expect((await d.page.request.get(asset(slug, ticket, "game/styles.css"))).status(), "with the session, after revocation").toBe(404);
  await d.page.reload();
  await expect(d.page.locator('[data-testid="package-game-frame"]')).toHaveCount(0);
  const restored = await admin.from("consumer_game_entitlements").update({ entitlement_state: "subscription-active", current_period_ends_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("user_id", users.D.id);
  if (restored.error) throw restored.error;
  expect((await anon.get(asset(slug, ticket, "game/styles.css"))).status(), "the re-check is live, not cached").toBe(200);
  await d.context.close();

  const e = await signedIn(browser, users.E);
  const opened = await openGame(e.page);
  expect((await anon.get(asset(opened.slug, opened.ticket, "game/main.js"))).status()).toBe(200);
  const suspended = await admin.from("consumer_accounts").update({ account_status: "suspended" }).eq("user_id", users.E.id);
  if (suspended.error) throw suspended.error;
  expect(nowS()).toBeLessThan(decode(opened.ticket).expiresAt);
  expect((await anon.get(asset(opened.slug, opened.ticket, "game/main.js"))).status(), "suspended account, cookie-less").toBe(404);
  expect((await e.page.request.get(asset(opened.slug, opened.ticket, "game/main.js"))).status(), "suspended account, with the session").toBe(404);
  await e.context.close();
});

test("school access: assets load without cookies and the ticket is bound to the school session", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  await page.goto("/access?next=/games");
  await page.getByLabel("Code (required)").fill(schoolCode);
  await page.getByRole("button", { name: "Continue" }).click();
  // Exactly /games: the authorize action has finished and the school session cookie is set.
  await expect(page).toHaveURL(`${base}/games`);
  const tracked = track(page);
  const { iframe, slug, ticket } = await openGame(page);
  await expectPackageFrame(page, iframe, tracked, testInfo);

  const cookie = (await context.cookies()).find((item) => item.name === "mathnexa-school-access");
  expect(cookie, "the school session cookie").toBeTruthy();
  const sid = JSON.parse(Buffer.from(cookie!.value.split(".")[0]!, "base64url").toString("utf8")).sid as string;
  expect(decode(ticket).principalId).toBe(sid);
  expect(ticket).not.toContain(cookie!.value);
  expect(ticket).not.toContain(cookie!.value.split(".")[1]!);
  expect((await admin.from("game_launch_events").select("id", { count: "exact", head: true }).eq("consumer_user_id", sid)).count ?? 0).toBe(0);

  expect((await anon.get(asset(slug, ticket, "game/styles.css"))).status()).toBe(200);
  expect((await anon.get(`/games/${slug}/runtime?ticket=${encodeURIComponent(ticket)}`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await anon.get(asset(slug, mint({ principalId: sid }), "game/styles.css"))).status(), "a delivery-key ticket for a school sid is not school access").toBe(404);
  expect((await anon.get(asset(slug, mint({ principalId: sid, key: schoolKey() }), "game/styles.css"))).status(), "the school-key format is reproduced").toBe(200);

  const a = await signedIn(browser, users.A);
  expect((await a.page.request.get(asset(slug, ticket, "game/styles.css"))).status(), "a consumer session with a school ticket").toBe(404);
  await a.context.close();
  const consumerTicket = mint({ principalId: users.A.id });
  expect((await page.request.get(asset(slug, consumerTicket, "game/styles.css"))).status(), "a school session with a consumer ticket").toBe(404);
  expect((await anon.get(asset(slug, consumerTicket, "game/styles.css"))).status()).toBe(200);
  await context.close();

  // A school ticket may never outlive its session: with under 300 s left, no frame is rendered.
  for (const [secondsLeft, framed] of [[120, false], [3600, true]] as const) {
    const late = await browser.newContext({ baseURL: base });
    await late.addCookies([{ name: "mathnexa-school-access", value: schoolCookie(randomUUID(), nowS() + secondsLeft), url: base, httpOnly: true, sameSite: "Lax" }]);
    const latePage = await late.newPage();
    await latePage.goto(`/games/${resourceId}`);
    await expect(latePage.locator('[data-testid="package-game-frame"]')).toHaveCount(framed ? 1 : 0);
    if (!framed) await expect(latePage.getByRole("link", { name: "Play now" })).toBeVisible();
    await late.close();
  }
});
