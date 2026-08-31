/**
 * Proves the framing half of the CSP against a deployed environment.
 *
 * `frame-ancestors 'self'` has two obligations and both must hold, because
 * satisfying either one alone is easy and useless: a cross-origin page must NOT
 * be able to frame the site (that is the clickjacking control), and a
 * same-origin page MUST still be able to, because the hosted game runtime is
 * delivered inside a same-origin sandboxed iframe.
 *
 * Usage: node scripts/certify-staging-framing.mjs <baseUrl>
 */
import { chromium } from "playwright";

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
if (!baseUrl) {
  console.error("usage: node scripts/certify-staging-framing.mjs <baseUrl>");
  process.exit(2);
}

const browser = await chromium.launch();
const failures = [];

/* ---- 1. Hostile cross-origin framing must be refused ------------------- */
{
  const context = await browser.newContext();
  const page = await context.newPage();
  // An attacker page on an origin we do not control. Served by the test itself
  // so no third-party system is touched.
  await page.route("https://attacker.example/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><title>hostile</title><iframe id="victim" src="${baseUrl}/sign-in"></iframe>`
    })
  );
  await page.goto("https://attacker.example/trap.html");
  await page.waitForTimeout(3500);

  const framed = await page.evaluate(() => {
    const frame = document.getElementById("victim");
    try {
      // If framing were permitted, the attacker could read the loaded document.
      return { reachable: Boolean(frame?.contentDocument?.body?.childElementCount) };
    } catch {
      // A cross-origin document that DID load throws on access. Distinguish
      // that from a blocked load by checking whether a child frame exists.
      return { reachable: true };
    }
  });
  const childFrames = page.frames().length - 1;
  const blocked = !framed.reachable || childFrames === 0;
  console.log(`cross-origin framing of /sign-in : ${blocked ? "BLOCKED (correct)" : "ALLOWED (clickjacking risk)"} [child frames: ${childFrames}]`);
  if (!blocked) failures.push("cross-origin framing was permitted");
  await context.close();
}

/* ---- 2. Same-origin framing must still work ---------------------------- */
{
  const context = await browser.newContext();
  const page = await context.newPage();
  const violations = [];
  await page.addInitScript(() => {
    window.__v = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__v.push(`${e.effectiveDirective}:${e.blockedURI}`)
    );
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const sameOrigin = await page.evaluate(async (base) => {
    const frame = document.createElement("iframe");
    // Exactly how the game runtime is embedded by /games/[resourceId].
    frame.sandbox = "allow-scripts";
    frame.src = `${base}/accessibility`;
    document.body.appendChild(frame);
    await new Promise((resolve) => {
      frame.addEventListener("load", resolve, { once: true });
      setTimeout(resolve, 6000);
    });
    return { attached: document.querySelectorAll("iframe").length };
  }, baseUrl);
  await page.waitForTimeout(500);
  violations.push(...(await page.evaluate(() => window.__v ?? [])));
  const frameLoaded = page.frames().length - 1 > 0;
  const frameAncestorViolation = violations.some((v) => v.startsWith("frame-ancestors"));
  console.log(`same-origin framing (game runtime pattern) : ${frameLoaded && !frameAncestorViolation ? "ALLOWED (correct)" : "BLOCKED (would break hosted games)"} [iframes: ${sameOrigin.attached}, child frames: ${page.frames().length - 1}]`);
  for (const v of violations) console.log(`      ! violation ${v}`);
  if (!frameLoaded || frameAncestorViolation) failures.push("same-origin framing was blocked — hosted games would break");
  await context.close();
}

/* ---- 3. Protected game runtime still denies anonymous callers ---------- */
{
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/game/runtime/index.html`, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 0;
  const denied = status === 401 || status === 404 || status === 403;
  console.log(`anonymous /game/runtime/index.html : ${status} ${denied ? "(correctly denied)" : "(UNEXPECTEDLY SERVED)"}`);
  if (!denied) failures.push(`game runtime served to an anonymous caller with ${status}`);
  await context.close();
}

await browser.close();
console.log(`\nFRAMING FAILURES: ${failures.length}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
