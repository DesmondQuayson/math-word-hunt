import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { GAME_ROUTE, keysFor, panel, questionText, solve, tapKeys, waitForUnlocked, type Team } from "./helpers";

/**
 * Math Tug of War — Online Match with the 3D scene on both clients.
 *
 * Two real browsers, the real API and database (local Supabase), with the 3D
 * layer forced on in both. Proves that the 3D scenes on both screens are
 * driven by the same authoritative room state (rope position, winner,
 * rematch, reconnect) and that the 3D layer never talks to the server or
 * changes what the server decides. Driven by
 * scripts/run-math-tug-of-war-online-e2e.mjs (project chromium-3d).
 */

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `tug-online-3d-${Date.now()}`;
const password = "SyntheticAdult42!";
const emails = { a: `${run}-a@example.test`, b: `${run}-b@example.test` };
const userIds: string[] = [];
let admin: SupabaseClient;

type Snapshot = {
  svg: number;
  renderer: string;
  three: null | { position: number; tugX: number; winner: string | null; states: Record<Team, string[]>; reachMiss: number; downgrades: unknown[]; celebration: null | { phase: string; t: number; hugArms: number; hugContact: number; rootY: number[] } };
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const email of Object.values(emails)) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (!created.data.user || created.error) throw created.error ?? new Error("Synthetic subscriber unavailable.");
    userIds.push(created.data.user.id);
    const startsAt = new Date();
    const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", created.data.user.id);
    if (account.error) throw account.error;
    const entitlement = await admin.from("consumer_game_entitlements").insert({
      user_id: created.data.user.id,
      entitlement_state: "trial-active",
      trial_started_at: startsAt.toISOString(),
      trial_ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString()
    });
    if (entitlement.error) throw entitlement.error;
  }
});

test.afterAll(async () => {
  await admin.from("tug_rooms").delete().in("host_name", ["Avi"]);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

async function signedIn3D(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page; apiBodies: Array<Record<string, unknown>> }> {
  const context = await browser.newContext({ baseURL: process.env.MATH_TUG_OF_WAR_ONLINE_URL ?? "http://127.0.0.1:3000" });
  // The review/test override: the 3D scene on, whatever the (headless) GPU.
  await context.addInitScript(() => {
    (window as unknown as { __MATHNEXA_GRAPHICS__?: string }).__MATHNEXA_GRAPHICS__ = "3d";
  });
  const page = await context.newPage();
  const apiBodies: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/games/math-tug-of-war/online") && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown> | null;
      if (body) apiBodies.push(body);
    }
  });
  await page.goto(`/sign-in?next=${encodeURIComponent(GAME_ROUTE)}`);
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((next) => !next.pathname.startsWith("/sign-in"), { timeout: 30_000 });
  await page.goto(GAME_ROUTE);
  await expect(page.getByRole("heading", { level: 1, name: /Math Tug of War/ })).toBeVisible({ timeout: 90_000 });
  return { context, page, apiBodies };
}

async function createRoom(page: Page, name: string, skill: string) {
  await page.locator("button[data-mode=online]").click();
  await page.locator("button[data-online=create]").click();
  await page.fill("#online-name", name);
  await page.locator(`#skill-${skill}`).check();
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page.getByText("Waiting for opponent…")).toBeVisible();
  return (await page.locator(".code-letter").allTextContents()).join("");
}

async function joinRoom(page: Page, name: string, code: string) {
  await page.locator("button[data-mode=online]").click();
  await page.locator("button[data-online=join]").click();
  await page.fill("#online-name", name);
  await page.fill("#room-code", code);
  await page.getByRole("button", { name: "Join Game" }).click();
}

async function inGame3D(page: Page, team: Team) {
  await expect(panel(page, team)).toBeVisible({ timeout: 20_000 });
  await expect(panel(page, team).locator(".question-text")).not.toHaveText("");
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "3d", { timeout: 90_000 });
}

async function answerOnline(page: Page, team: Team, { wrong = false } = {}) {
  await waitForUnlocked(page, team);
  await expect(panel(page, team).locator('.key[data-key="submit"]')).toBeEnabled();
  const value = solve(await questionText(page, team)) + (wrong ? 1 : 0);
  await tapKeys(page, team, keysFor(value));
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().endsWith("/api/games/math-tug-of-war/online") && candidate.request().postDataJSON()?.action === "answer"),
    tapKeys(page, team, ["submit"])
  ]);
  expect((await response.json()).state.result).toBe(wrong ? "incorrect" : "correct");
}

function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const scene = (window as unknown as { __MATHNEXA_TUG_SCENE__?: { snapshot(): { renderer: string; three: Snapshot["three"] } } }).__MATHNEXA_TUG_SCENE__;
    const snap = scene?.snapshot();
    return { svg: Number(document.querySelector(".tug-scene-svg")?.getAttribute("data-position") ?? NaN), renderer: snap?.renderer ?? "none", three: snap?.three ?? null };
  });
}

function ropeHeight(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as { __MATHNEXA_TUG_3D_DEBUG__: { rope: { geometry: { attributes: { position: { array: Float32Array } } } } } }).__MATHNEXA_TUG_3D_DEBUG__;
    const positions = d.rope.geometry.attributes.position.array;
    let max = -Infinity;
    for (let index = 1; index < positions.length; index += 3) max = Math.max(max, positions[index]);
    return max;
  });
}

/** Both screens settle on the same authoritative rope position, in the SVG and the 3D scene. */
async function bothAt(pages: Page[], expected: number) {
  for (const page of pages) {
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", String(expected), { timeout: 10_000 });
    await expect.poll(async () => (await snapshot(page)).three?.position, { timeout: 10_000 }).toBe(expected);
    const snap = await snapshot(page);
    expect(snap.renderer).toBe("3d");
    expect(snap.three?.winner).toBeNull();
  }
}

const CLIENT_FIELDS = new Set(["action", "code", "token", "round", "questionIndex", "answer", "name", "skill"]);

test("two 3D clients: pulls, animation states, winner, celebration, rematch and reconnect all follow the room state", async ({ browser }) => {
  const a = await signedIn3D(browser, emails.a);
  const b = await signedIn3D(browser, emails.b);
  const code = await createRoom(a.page, "Avi", "addition");
  await joinRoom(b.page, "Bo", code);
  await expect(b.page.getByRole("heading", { name: "Both players ready" })).toBeVisible();
  await expect(a.page.getByRole("heading", { name: "Both players ready" })).toBeVisible({ timeout: 10_000 });
  await inGame3D(a.page, "turquoise");
  await inGame3D(b.page, "pink");
  const pages = [a.page, b.page];
  await bothAt(pages, 0);
  for (const page of pages) expect((await snapshot(page)).three?.states).toEqual({ turquoise: ["ready", "ready", "ready"], pink: ["ready", "ready", "ready"] });

  // A pulls: both 3D scenes move to -1 and both animate the same event (Turquoise heaves, Pink is yanked).
  await answerOnline(a.page, "turquoise");
  for (const page of pages) {
    await expect.poll(async () => (await snapshot(page)).three?.states.turquoise.some((state) => state === "pulling"), { timeout: 5_000 }).toBe(true);
  }
  await bothAt(pages, -1);
  for (const page of pages) expect((await snapshot(page)).three?.reachMiss ?? 1).toBeLessThan(0.03);
  // B pulls back.
  await answerOnline(b.page, "pink");
  await bothAt(pages, 0);
  // A wrong answer moves nothing, in either layer, on either screen.
  await answerOnline(b.page, "pink", { wrong: true });
  await b.page.waitForTimeout(1_500);
  await bothAt(pages, 0);
  for (const page of pages) expect((await snapshot(page)).three?.states.pink.every((state) => state === "ready")).toBe(true);
  // The database agrees with both screens.
  const record = await admin.from("tug_rooms").select("position,host_pulls,guest_pulls").eq("code", code).eq("status", "playing").single();
  expect(record.data).toMatchObject({ position: 0, host_pulls: 1, guest_pulls: 1 });

  // A wins: the winner, the celebration and the fall appear on both screens only once the server says so.
  for (let pull = 1; pull <= 6; pull += 1) {
    await answerOnline(a.page, "turquoise");
    await bothAt(pages, -pull);
    for (const page of pages) expect((await snapshot(page)).three?.states.turquoise).not.toContain("celebrate");
  }
  await answerOnline(a.page, "turquoise");
  for (const page of pages) {
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Avi WINS!" })).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await snapshot(page)).three?.winner, { timeout: 10_000 }).toBe("turquoise");
    await expect.poll(async () => (await snapshot(page)).three?.states.turquoise).toEqual(["celebrate", "celebrate", "celebrate"]);
    await expect.poll(async () => (await snapshot(page)).three?.states.pink.every((state) => ["falling", "down", "rising", "dejected"].includes(state)), { timeout: 10_000 }).toBe(true);
    expect((await snapshot(page)).svg).toBe(-7);
  }
  await a.page.waitForTimeout(1_600);
  for (const page of pages) expect(await ropeHeight(page)).toBeLessThan(0.12);
  // Both screens show the same winning team hugging and jumping, on the same shared clock.
  await a.page.waitForTimeout(1_800);
  const [hugA, hugB] = await Promise.all(pages.map((page) => snapshot(page)));
  for (const snap of [hugA, hugB]) {
    expect(snap.three?.winner).toBe("turquoise");
    expect(["hug", "jump"]).toContain(snap.three?.celebration?.phase);
    expect(snap.three?.celebration?.hugArms ?? 0).toBeGreaterThanOrEqual(3);
    // Contact precision is certified locally; here the dev-server tab runs slower frames, so allow the lag.
    expect(snap.three?.celebration?.hugContact ?? 1).toBeLessThan(0.1);
  }
  expect(Math.abs((hugA.three?.celebration?.t ?? 0) - (hugB.three?.celebration?.t ?? 0))).toBeLessThan(1.5);
  const finished = await admin.from("tug_rooms").select("position,winner,status").eq("code", code).single();
  expect(finished.data?.position).toBe(-7);

  // Rematch: both 3D scenes reset together.
  await a.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  await expect(b.page.locator(".rematch-status")).toHaveText("Avi wants a rematch!", { timeout: 10_000 });
  await b.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  for (const page of pages) await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
  await bothAt(pages, 0);
  for (const page of pages) {
    const snap = await snapshot(page);
    expect(snap.three?.states).toEqual({ turquoise: ["ready", "ready", "ready"], pink: ["ready", "ready", "ready"] });
    expect(await ropeHeight(page)).toBeGreaterThan(0.7);
  }
  await answerOnline(b.page, "pink");
  await bothAt(pages, 1);

  // Reload reconnect: B's rebuilt 3D scene picks up the live position.
  await b.page.reload();
  await b.page.locator("button[data-mode=online]").click();
  await b.page.getByRole("button", { name: `Return to room ${code}` }).click();
  await inGame3D(b.page, "pink");
  await bothAt(pages, 1);
  await answerOnline(a.page, "turquoise");
  await bothAt(pages, 0);

  // Leaving ends the match without any celebration on the other screen.
  await b.page.getByRole("button", { name: "Exit to game setup" }).click();
  await expect(a.page.getByRole("dialog").getByText("Bo left the match.")).toBeVisible({ timeout: 10_000 });
  expect((await snapshot(a.page)).three?.winner).toBeNull();
  expect((await snapshot(a.page)).three?.states.turquoise).not.toContain("celebrate");
  for (const page of pages) expect((await snapshot(page)).three?.downgrades ?? []).toEqual([]);

  // No gameplay authority in the 3D layer: the clients only ever sent answers
  // and room actions, never a position, a pull count or a winner.
  for (const bodies of [a.apiBodies, b.apiBodies]) {
    expect(bodies.length).toBeGreaterThan(5);
    for (const body of bodies) {
      for (const key of Object.keys(body)) expect(CLIENT_FIELDS.has(key), `client sent ${key}`).toBe(true);
    }
  }
  await a.context.close();
  await b.context.close();
});
