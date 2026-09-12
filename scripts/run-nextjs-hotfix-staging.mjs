// Staging-only pipeline for the Next.js 16.3.4 security hotfix.
//
//   --stage=deploy    deploy the clean candidate tree to mathnexa-platform-staging
//                     (production target of the STAGING project) from the
//                     repository root, naming the project explicitly, and wait
//                     for it to answer.
//   --stage=certify   probe the deployment through the locked staging gate with
//                     a cookie minted by the bootstrap endpoint: every public
//                     and authenticated route answers without a 5xx or an
//                     unexpected redirect, security headers are intact, the
//                     Stripe webhook refuses an unsigned body with 400
//                     invalid-signature (never 308 / 404 / 5xx), health answers,
//                     the scheduler route fails closed, admin is concealed to an
//                     anonymous caller, representative images and the image
//                     optimizer answer 200, and a real browser reports no
//                     console errors and every rendered image decoded.
//   --stage=all       deploy, certify.
//
// Only STAGING identifiers are hard-coded. Production project refs are refused
// if they appear in the environment. No credential is ever printed.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const STAGING_VERCEL_PROJECT = "mathnexa-platform-staging";
const STAGING_ORIGIN = "https://mathnexa-platform-staging.vercel.app";
const SCOPE = "bright-path-ed-tech";
const LEGACY_PRODUCTION_PROJECT_REF = "ioodoktlxvvmghyvevgn";
const PREVIOUS_PH2_07_DEPLOYMENT = "dpl_FeZbD1JF2tZgjCb4n75ZpbDCu8yi";

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const stage = args.get("--stage") ?? "certify";
const targetUrl = (args.get("--url") ?? STAGING_ORIGIN).replace(/\/$/, "");
const repositoryRoot = resolve(process.cwd());
const logFile = args.get("--log") ?? process.env.HOTFIX_LOG_FILE?.trim() ?? "";
if (logFile) {
  const { appendFileSync } = await import("node:fs");
  for (const method of ["log", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...parts) => { original(...parts); try { appendFileSync(logFile, `${new Date().toISOString()} ${parts.map(String).join(" ")}\n`); } catch { /* best effort */ } };
  }
}
const step = (label) => console.log(`STEP ${new Date().toISOString()} ${label}`);
const secrets = [];
function redact(value) {
  let safe = String(value ?? "");
  for (const secret of secrets) if (secret) safe = safe.replaceAll(secret, "[REDACTED]");
  return safe.replace(/Bearer [A-Za-z0-9._-]+/g, "Bearer [redacted]").replace(/__Host-mvh-staging-access=[^;\s]+/g, "__Host-mvh-staging-access=[redacted]");
}
function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], shell: options.shell ?? false });
  if (result.status !== 0 && !options.allowFailure) throw new Error(`command-failed:${redact(`${result.stdout}\n${result.stderr}`).slice(-3000)}`);
  return options.allowFailure ? { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } : (result.stdout ?? "").trim();
}
function check(condition, code) { if (!condition) throw new Error(code); }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const evidence = { stage, startedAt: new Date().toISOString(), target: targetUrl, previousPh207Deployment: PREVIOUS_PH2_07_DEPLOYMENT };

function refuseProductionIdentifiers() {
  check(!Object.values(process.env).some((value) => typeof value === "string" && value.includes(LEGACY_PRODUCTION_PROJECT_REF)), "production-project-ref-present-refusing");
  for (const name of Object.keys(process.env)) check(!/_LIVE_|_PRODUCTION_/.test(name) || !process.env[name], `live-or-production-variable-loaded-refusing:${name}`);
}
function vercel(commandArgs, options = {}) {
  const cli = process.env.HOTFIX_VERCEL_CLI?.trim() || "npx";
  const prefix = cli === "npx" ? ["vercel", ...commandArgs] : commandArgs;
  return run(cli, [...prefix, "--scope", SCOPE], { shell: true, ...options });
}

async function deploy() {
  refuseProductionIdentifiers();
  check(run("git", ["status", "--porcelain"]) === "", "working-tree-dirty-refusing");
  evidence.commit = run("git", ["rev-parse", "HEAD"]);
  evidence.tree = run("git", ["rev-parse", "HEAD^{tree}"]);
  evidence.nextVersion = JSON.parse(run("node", ["-e", "process.stdout.write(JSON.stringify(require('./node_modules/next/package.json').version))"]));
  check(evidence.nextVersion === "16.3.4", `unexpected-next-version:${evidence.nextVersion}`);
  step("deploy");
  const output = vercel(
    // MVH_SOURCE_REVISION stamps this deployment with the revision it was built
    // from, which is what /api/health publishes as `build` (bug sweep BS-08). A
    // CLI deployment carries git metadata but no VERCEL_GIT_COMMIT_SHA, so
    // without this the endpoint would honestly report "unknown". Deployment
    // scoped: no project environment variable is created or changed.
    ["deploy", ".", "--project", STAGING_VERCEL_PROJECT, "--prod", "--yes", "--env", `MVH_SOURCE_REVISION=${evidence.commit}`, "--meta", `candidateCommit=${evidence.commit}`, "--meta", `candidateTree=${evidence.tree}`, "--meta", "purpose=nextjs-16.3.4-security-hotfix"],
    { allowFailure: true }
  );
  const combined = `${output.stdout}\n${output.stderr}`;
  check(output.status === 0, `deploy-failed:${redact(combined).slice(-1500)}`);
  evidence.deploymentUrl = combined.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g)?.find((url) => url.includes("mathnexa-platform-staging")) ?? null;
  const inspect = vercel(["inspect", evidence.deploymentUrl ?? STAGING_ORIGIN], { allowFailure: true });
  evidence.deploymentId = (`${inspect.stdout}\n${inspect.stderr}`.match(/dpl_[A-Za-z0-9]+/) ?? [null])[0];
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${targetUrl}/api/health`, { redirect: "manual" }).catch(() => null);
    if (response && (response.status === 200 || response.status === 404)) { evidence.healthStatus = response.status; break; }
    await sleep(5_000);
  }
}

async function probe(path, init = {}) {
  const started = performance.now();
  const response = await fetch(`${targetUrl}${path}`, { redirect: "manual", ...init });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    ms: Math.round(performance.now() - started),
    bytes: body.length,
    type: response.headers.get("content-type"),
    location: response.headers.get("location"),
    cacheControl: response.headers.get("cache-control"),
    headers: Object.fromEntries(["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "x-robots-tag", "x-matched-path", "x-vercel-cache"].map((name) => [name, response.headers.get(name)])),
    text: body.toString("utf8").slice(0, 400)
  };
}

async function certify() {
  refuseProductionIdentifiers();
  const stagingToken = required("MVH_STAGING_ACCESS_TOKEN", /^[A-Za-z0-9_-]{43}$/);
  const cronSecret = process.env.CRON_SECRET_STAGING?.trim() ?? "";
  secrets.push(stagingToken, cronSecret);
  const results = {};

  step("gate locked for anonymous callers");
  for (const path of ["/", "/sign-in", "/account", "/admin", "/sign-in.png"]) {
    const response = await probe(path);
    results[`locked ${path}`] = { status: response.status, bytes: response.bytes };
    check(response.status === 404 && response.bytes === 0, `staging-gate-open:${path}`);
  }

  step("webhook refuses an unsigned body through the gate exemption");
  results.webhookUnsigned = await probe("/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check(results.webhookUnsigned.status === 400 && /invalid-signature/.test(results.webhookUnsigned.text), `webhook-unsigned-${results.webhookUnsigned.status}`);
  check(!results.webhookUnsigned.location, "webhook-redirected");

  step("gate cookie from the bootstrap endpoint");
  const bootstrap = await fetch(`${targetUrl}/api/internal/staging-access/bootstrap`, { method: "POST", redirect: "manual", headers: { authorization: `Bearer ${stagingToken}` } });
  const setCookie = bootstrap.headers.get("set-cookie") ?? "";
  const cookie = (setCookie.match(/__Host-mvh-staging-access=[^;]+/) ?? [null])[0];
  results.bootstrap = { status: bootstrap.status, cookie: Boolean(cookie) };
  check(bootstrap.status === 204 && cookie, "bootstrap-refused");
  const gated = { headers: { cookie } };

  step("routes answer through the gate");
  // Expectations mirror the v1.2.7 production runtime exactly (verified read-only
  // on https://mathnexa.com before this run): a signed-out visitor is sent from
  // the product surfaces to the access chooser (/access?next=…) or to sign-in;
  // those are the ONLY acceptable redirects, and the private surfaces must
  // carry no-store on the way.
  const expectations = [
    ["/", 200], ["/sign-in", 200], ["/sign-up", 200], ["/access", 200], ["/privacy", 200], ["/terms", 200],
    ["/pricing", "access-redirect"], ["/games", "access-redirect"], ["/map-prep", "access-redirect"],
    ["/homework", "access-redirect"], ["/quizzes", "access-redirect"],
    ["/account", "private-redirect"], ["/subscription", "private-redirect"], ["/game-access", "private-redirect"],
    ["/api/health", 200], ["/admin", 404], ["/admin/sign-in", 200],
    ["/api/internal/billing/fixture", "absent"], ["/game/runtime/index.html", 401]
  ];
  results.routes = {};
  for (const [path, expected] of expectations) {
    const response = await probe(path, gated);
    const isRedirect = response.status >= 300 && response.status < 400;
    const toAccessOrSignIn = /^(https:\/\/[^/]+)?\/(access|sign-in)\?next=/.test(response.location ?? "");
    const ok = expected === "access-redirect" ? isRedirect && toAccessOrSignIn
      : expected === "private-redirect" ? isRedirect && toAccessOrSignIn && /no-store/.test(response.cacheControl ?? "")
      : expected === "absent" ? response.status === 404 || response.status === 405
      : response.status === expected;
    results.routes[path] = { status: response.status, ms: response.ms, location: response.location, cacheControl: response.cacheControl, ok };
    check(ok, `route-unexpected:${path}:${response.status}${response.location ? `->${response.location}` : ""}`);
    check(response.status < 500, `route-5xx:${path}`);
  }

  step("security headers intact");
  const home = await probe("/", gated);
  results.securityHeaders = home.headers;
  for (const name of ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
    check(Boolean(home.headers[name]), `security-header-missing:${name}`);
  }
  check(/frame-ancestors 'self'/.test(home.headers["content-security-policy"] ?? ""), "csp-frame-ancestors-changed");
  check(/form-action 'self' https:\/\/checkout\.stripe\.com https:\/\/billing\.stripe\.com/.test(home.headers["content-security-policy"] ?? ""), "csp-form-action-changed");

  step("scheduler route fails closed");
  results.schedulerAnonymous = await probe("/api/internal/billing/reconcile", gated);
  check(results.schedulerAnonymous.status === 401 || results.schedulerAnonymous.status === 503, `scheduler-open:${results.schedulerAnonymous.status}`);
  if (cronSecret) {
    results.schedulerWrongBearer = await probe("/api/internal/billing/reconcile", { headers: { ...gated.headers, authorization: `Bearer ${cronSecret}x` } });
    check(results.schedulerWrongBearer.status === 401, "scheduler-accepted-wrong-bearer");
  }

  step("images and the optimizer");
  // Static assets under /media/** sit behind the staging gate (only _next/*,
  // the root icons, brand/, game-suite/ and internal-games/ are exempt), so
  // they are fetched with the gate cookie, exactly as a visitor's browser
  // would. The platform optimizer fetches its SOURCE without any visitor
  // cookie, so on a LOCKED staging it can only optimize gate-exempt sources;
  // gated sources are recorded for the owner, not asserted — production has
  // no gate and serves them all.
  const accept = { accept: "image/avif,image/webp,image/*,*/*;q=0.8" };
  const staticImages = [
    ["brand mark (static, exempt)", "/brand/mathnexa-mark.png"],
    ["root icon (static, exempt)", "/icon.png"],
    ["game thumbnail avif (static, gated)", "/media/games/number-cross.avif"],
    ["game thumbnail webp (static, gated)", "/media/games/number-cross.webp"],
    ["vocabulary hunt thumbnail webp (static, gated)", "/media/games/math-vocabulary-hunt.webp"],
    ["number logic thumbnail avif (static, gated)", "/media/games/number-logic.avif"],
    ["crosscalc mark svg (static, gated)", "/media/games/crosscalc.svg"]
  ];
  results.images = {};
  for (const [label, path] of staticImages) {
    const response = await probe(path, { headers: { ...gated.headers, ...accept } });
    results.images[label] = { status: response.status, type: response.type, bytes: response.bytes, cache: response.headers["x-vercel-cache"] };
    check(response.status === 200 && /^image\//.test(response.type ?? ""), `image-failed:${label}:${response.status}`);
  }
  for (const [label, path] of [
    ["optimizer: icon (exempt source)", "/_next/image?url=%2Ficon.png&w=64&q=75"],
    ["optimizer: icon 256 (exempt source)", "/_next/image?url=%2Ficon.png&w=256&q=75"],
    ["optimizer: brand mark (exempt source)", "/_next/image?url=%2Fbrand%2Fmathnexa-mark.png&w=128&q=75"]
  ]) {
    const response = await probe(path, { headers: accept });
    results.images[label] = { status: response.status, type: response.type, bytes: response.bytes, cache: response.headers["x-vercel-cache"], matchedPath: response.headers["x-matched-path"] };
    check(response.status === 200 && /^image\//.test(response.type ?? ""), `optimizer-failed:${label}:${response.status}`);
  }
  for (const [label, path] of [
    ["optimizer: gated webp source (recorded only on locked staging)", "/_next/image?url=%2Fmedia%2Fgames%2Fnumber-cross.webp&w=384&q=75"],
    ["optimizer: gated avif source (recorded only on locked staging)", "/_next/image?url=%2Fmedia%2Fgames%2Fnumber-cross.avif&w=384&q=75"]
  ]) {
    const response = await probe(path, { headers: accept });
    results.images[label] = { status: response.status, type: response.type, bytes: response.bytes };
    check(response.status < 500, `optimizer-5xx:${label}:${response.status}`);
  }
  for (const [label, path] of [["optimizer: remote refused", "/_next/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=64&q=75"], ["optimizer: traversal refused", "/_next/image?url=%2F..%2F..%2Fetc%2Fpasswd&w=64&q=75"]]) {
    const response = await probe(path);
    results.images[label] = { status: response.status };
    check(response.status >= 400 && response.status < 500, `optimizer-accepted:${label}:${response.status}`);
  }

  step("browser: console errors and decoded images");
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([{ name: "__Host-mvh-staging-access", value: cookie.split("=")[1], url: targetUrl }]);
    results.browser = {};
    // The product surfaces land on the access chooser for a signed-out visitor,
    // so the browser pass exercises the public pages plus that chooser and the
    // admin sign-in page — every page an anonymous visitor can actually render.
    for (const path of ["/", "/sign-in", "/sign-up", "/access", "/pricing", "/games", "/admin/sign-in", "/privacy"]) {
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200)); });
      page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${String(error.message).slice(0, 200)}`));
      page.on("requestfailed", (request) => failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url().replace(targetUrl, "")}`.slice(0, 200)));
      const response = await page.goto(`${targetUrl}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
      const decoded = await page.evaluate(() => [...document.images].map((img) => ({ src: img.currentSrc.replace(location.origin, "").slice(0, 120), complete: img.complete, natural: img.naturalWidth })));
      const brokenImages = decoded.filter((img) => !img.complete || img.natural === 0).map((img) => img.src);
      const finalPath = new URL(page.url()).pathname;
      results.browser[path] = { status: response?.status() ?? null, finalPath, images: decoded.length, brokenImages, consoleErrors, failedRequests };
      await page.close();
      check((response?.status() ?? 0) === 200, `browser-status:${path}`);
      check(finalPath === path || finalPath === "/access", `browser-unexpected-destination:${path}->${finalPath}`);
      check(brokenImages.length === 0, `broken-images:${path}:${brokenImages.join(",")}`);
      check(consoleErrors.length === 0, `console-errors:${path}:${consoleErrors.join(" | ")}`);
    }
    await browser.close();
  } catch (error) {
    if (/Cannot find package|ENOENT|Executable doesn't exist/.test(String(error.message))) {
      results.browser = `NOT TESTED (${redact(String(error.message)).slice(0, 160)})`;
    } else {
      throw error;
    }
  }
  evidence.results = results;
}

try {
  if (stage === "deploy" || stage === "all") { step("deploy"); await deploy(); }
  if (stage === "certify" || stage === "all") { step("certify"); await certify(); }
  evidence.completedAt = new Date().toISOString();
  evidence.outcome = "PASS";
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.outcome = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error)).slice(0, 2000);
  process.exitCode = 1;
} finally {
  const evidencePath = join(tmpdir(), `mathnexa-nextjs-hotfix-evidence-${Date.now()}.json`);
  writeFileSync(evidencePath, redact(JSON.stringify(evidence, null, 2)));
  console.log(redact(JSON.stringify(evidence, null, 2)));
  console.log(`EVIDENCE ${evidencePath}`);
}
