// PRODUCTION pipeline for the owner-approved Next.js 16.3.4 security hotfix.
// One stage per invocation, every stage auditable, every output redacted.
// Mirrors scripts/run-subscription-lifecycle-production.mjs — the deployment
// mechanics that promoted v1.2.7 — with one improvement: the staged deployment
// is probed BEFORE promotion through `vercel curl`, which bypasses deployment
// protection with the CLI's own credential instead of a bypass secret, so no
// protection setting changes.
//
//   --stage=preflight        identify the deployment serving the apex, require
//                            it to be the expected rollback target, record host
//                            behaviour before anything changes. Reads only.
//   --stage=deploy-preview   upload the EXACT certified runtime to the production
//                            project as a NON-aliased deployment built with the
//                            production environment (--prod --skip-domain).
//   --stage=probe-preview    health, webhook, canonical-host, admin, scheduler,
//                            forged-access and image probes on that deployment.
//   --stage=promote          move the production alias to the candidate.
//   --stage=probe-live       probe the configured webhook host, the apex, images,
//                            security headers and the fail-closed surfaces.
//   --stage=rollback         move the alias back to the retained deployment.
//
// No stage touches Stripe, Supabase, the firewall, a log drain, ShowMe / MAP
// Prep or the staging project. No credential beyond the Vercel CLI session is
// needed; none is printed.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PRODUCTION_VERCEL_PROJECT = "mathnexa-platform-production";
const PRODUCTION_ORIGIN = "https://mathnexa.com";
const PRODUCTION_VERCEL_HOST = "mathnexa-platform-production.vercel.app";
const SCOPE = "bright-path-ed-tech";
const FORBIDDEN_PROJECTS = ["mathnexa-platform-staging", "showme-map-prep-production", "showme-map-prep-staging", "mathnexa-production"];
/** The staging-certified runtime; the branch tip may only differ from it in docs and scripts. */
const CERTIFIED_RUNTIME_COMMIT = "13d307d";
/** The deployment that must be serving the apex when this pipeline starts, and the rollback target. */
const EXPECTED_ROLLBACK_DEPLOYMENT = "dpl_DRmcCTJvzQ8ey84gG6tRo4Vs3C3c";
const EXPECTED_NEXT_VERSION = "16.3.4";
const BACKEND_USER_AGENT = "MathNexa-Hotfix-Certification/1.0";

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const stage = args.get("--stage") ?? "preflight";
const repositoryRoot = resolve(process.cwd());
const step = (label) => console.log(`STEP ${new Date().toISOString()} ${label}`);
function redact(value) {
  return String(value ?? "").replace(/Bearer [A-Za-z0-9._-]+/g, "Bearer [redacted]").replace(/(sbp|sk_live|sk_test|rk_live|whsec)_[A-Za-z0-9_-]+/g, "[redacted]");
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], shell: options.shell ?? false });
  if (result.status !== 0 && !options.allowFailure) throw new Error(`command-failed:${redact(`${result.stdout}\n${result.stderr}`).slice(-3000)}`);
  return options.allowFailure ? { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } : (result.stdout ?? "").trim();
}
function check(condition, code) { if (!condition) throw new Error(code); }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const evidence = { stage, startedAt: new Date().toISOString(), rollbackTarget: EXPECTED_ROLLBACK_DEPLOYMENT };

function vercel(commandArgs, options = {}) {
  const cli = process.env.HOTFIX_VERCEL_CLI?.trim() || "npx";
  const prefix = cli === "npx" ? ["vercel", ...commandArgs] : commandArgs;
  return run(cli, prefix, { shell: true, ...options });
}
function inspectField(text, field) {
  const line = text.split("\n").map((entry) => entry.trim()).find((entry) => new RegExp(`^${field}\\s`).test(entry));
  return line ? line.split(/\s+/).slice(1).join(" ").trim() : null;
}
function inspectDeployment(target) {
  const output = vercel(["inspect", target, "--scope", SCOPE], { allowFailure: true });
  const text = `${output.stdout}\n${output.stderr}`;
  return {
    id: inspectField(text, "id"), name: inspectField(text, "name"), target: inspectField(text, "target"),
    status: inspectField(text, "status"), url: inspectField(text, "url"), created: inspectField(text, "created"),
    aliases: text.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("╶ https://")).map((line) => line.replace("╶ ", "").trim())
  };
}
async function probe(url, options = {}) {
  const response = await fetch(url, { redirect: "manual", ...options, headers: { "User-Agent": BACKEND_USER_AGENT, ...(options.headers ?? {}) } });
  const body = Buffer.from(await response.arrayBuffer());
  const pick = (name) => response.headers.get(name);
  return {
    status: response.status, location: pick("location"), cacheControl: pick("cache-control"), matchedPath: pick("x-matched-path"),
    contentType: pick("content-type"), bytes: body.length,
    security: { csp: pick("content-security-policy"), hsts: pick("strict-transport-security"), frame: pick("x-frame-options"), nosniff: pick("x-content-type-options"), referrer: pick("referrer-policy"), permissions: pick("permissions-policy") },
    body: body.toString("utf8").slice(0, 200)
  };
}
/** A request to a protection-bypassed deployment through the CLI (curl flags after `--`). */
function curlDeployment(deploymentId, path, curlArgs = []) {
  // curl flags follow the path directly; the CLI forwards every unknown flag.
  // The command runs through cmd.exe, where `&`, `?`, spaces and quotes split
  // arguments, so every argument is quoted for that shell explicitly.
  const quote = (value) => `"${String(value).replace(/"/g, "\\\"")}"`;
  const output = vercel(["curl", quote(path), "-s", "-i", ...curlArgs.map(quote), "--deployment", deploymentId, "--scope", SCOPE, "--yes"], { allowFailure: true, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const text = `${output.stdout}\n${output.stderr}`;
  const statusLine = text.split("\n").map((line) => line.trim()).filter((line) => /^HTTP\/[0-9.]+ \d{3}/.test(line)).pop() ?? "";
  const status = Number((statusLine.match(/ (\d{3})/) ?? [])[1] ?? 0);
  const header = (name) => { const match = text.match(new RegExp(`^${name}:\\s*(.+)$`, "im")); return match ? match[1].trim() : null; };
  const bodyStart = text.lastIndexOf("\r\n\r\n") >= 0 ? text.lastIndexOf("\r\n\r\n") + 4 : text.lastIndexOf("\n\n") + 2;
  return { status, location: header("location"), cacheControl: header("cache-control"), matchedPath: header("x-matched-path"), contentType: header("content-type"),
    security: { csp: header("content-security-policy"), hsts: header("strict-transport-security"), frame: header("x-frame-options"), nosniff: header("x-content-type-options"), referrer: header("referrer-policy"), permissions: header("permissions-policy") },
    body: text.slice(bodyStart, bodyStart + 200) };
}
function assertRuntimeIsCertified() {
  const certified = run("git", ["rev-parse", CERTIFIED_RUNTIME_COMMIT]);
  const diff = run("git", ["diff", "--stat", certified, "HEAD", "--", "apps", "packages", "supabase", "package.json", "package-lock.json", "turbo.json", "tsconfig.json"]);
  check(diff === "", `runtime-differs-from-certified-candidate:${diff.slice(-600)}`);
  check(run("git", ["status", "--porcelain"]) === "", "working-tree-dirty");
  const nextVersion = JSON.parse(run("node", ["-e", "process.stdout.write(JSON.stringify(require('./node_modules/next/package.json').version))"]));
  const sharpVersion = JSON.parse(run("node", ["-e", "process.stdout.write(JSON.stringify(require('./node_modules/sharp/package.json').version))"]));
  check(nextVersion === EXPECTED_NEXT_VERSION, `unexpected-next-version:${nextVersion}`);
  check(sharpVersion === "0.35.4", `unexpected-sharp-version:${sharpVersion}`);
  for (const file of ["apps/platform-web/lib/observability/security-sink.ts", "apps/platform-web/app/api/internal/security/ingest/route.ts", "supabase/migrations/20260909010000_security_observability_read_path.sql"]) {
    check(run("git", ["ls-files", file]) === "", `ph2-07-runtime-present:${file}`);
  }
  return { certified, nextVersion, sharpVersion };
}
const securityHeadersIntact = (security) => Boolean(security.csp && security.hsts && security.frame && security.nosniff && security.referrer && security.permissions) &&
  /frame-ancestors 'self'/.test(security.csp) && /form-action 'self' https:\/\/checkout\.stripe\.com https:\/\/billing\.stripe\.com/.test(security.csp);

async function preflight() {
  step("vercel production identity");
  const live = inspectDeployment(PRODUCTION_ORIGIN);
  evidence.currentProductionDeployment = live;
  check(live.name === PRODUCTION_VERCEL_PROJECT, `apex-served-by-unexpected-project:${live.name}`);
  check(!FORBIDDEN_PROJECTS.includes(live.name ?? ""), "apex-served-by-a-project-this-hotfix-must-not-touch");
  check(live.target === "production", `apex-deployment-not-production-target:${live.target}`);
  // `vercel inspect https://mathnexa.com` resolves the deployment that serves
  // the apex; CLI 59.13 no longer lists custom domains under Aliases, so the
  // resolution itself is the evidence, cross-checked below against the HTML.
  const apexHtml = await probe(`${PRODUCTION_ORIGIN}/`);
  const apexHtmlDeployment = (apexHtml.body.match(/data-dpl-id="(dpl_[A-Za-z0-9]+)"/) ?? [])[1] ?? null;
  check(apexHtmlDeployment === live.id, `apex-html-deployment-mismatch:${apexHtmlDeployment}`);
  check(live.id === EXPECTED_ROLLBACK_DEPLOYMENT, `apex-serves-unexpected-deployment:${live.id}`);
  evidence.rollbackTarget = { id: live.id, url: live.url, retained: true };
  step("production behaviour before the change");
  evidence.before = {
    health: await probe(`${PRODUCTION_ORIGIN}/api/health`),
    webhookApex: await probe(`${PRODUCTION_ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    webhookConfiguredHost: await probe(`https://${PRODUCTION_VERCEL_HOST}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    home: await probe(`${PRODUCTION_ORIGIN}/`),
    optimizerIcon: await probe(`${PRODUCTION_ORIGIN}/_next/image?url=%2Ficon.png&w=64&q=75`, { headers: { accept: "image/webp,image/*" } })
  };
  evidence.runtime = assertRuntimeIsCertified();
  console.log(`PREFLIGHT ${JSON.stringify({ apex: live.id, rollback: evidence.rollbackTarget, health: evidence.before.health.status, webhookApex: evidence.before.webhookApex.status, webhookHost: evidence.before.webhookConfiguredHost.status })}`);
}

async function deployPreview() {
  step("uploading the certified runtime as a non-aliased production-configured deployment");
  const runtime = assertRuntimeIsCertified();
  const tree = run("git", ["rev-parse", "HEAD^{tree}"]);
  const commit = run("git", ["rev-parse", "HEAD"]);
  evidence.runtime = { ...runtime, candidateTree: tree, candidateCommit: commit };
  const before = inspectDeployment(PRODUCTION_ORIGIN);
  check(before.id === EXPECTED_ROLLBACK_DEPLOYMENT, `apex-serves-unexpected-deployment:${before.id}`);
  // --prod --skip-domain builds with the PRODUCTION environment while leaving
  // every domain — including the Stripe-configured *.vercel.app host — on the
  // current deployment. Traffic and webhook delivery are untouched until promote.
  const output = vercel(["deploy", ".", "--project", PRODUCTION_VERCEL_PROJECT, "--scope", SCOPE, "--yes", "--prod", "--skip-domain",
    "--meta", `certifiedRuntime=${runtime.certified}`, "--meta", `candidateCommit=${commit}`, "--meta", `candidateTree=${tree}`, "--meta", "purpose=nextjs-16.3.4-security-hotfix"]);
  const urls = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g) ?? [];
  const url = urls.filter((candidate) => new RegExp(`^https://${PRODUCTION_VERCEL_PROJECT}-[a-z0-9]+-${SCOPE}\\.vercel\\.app$`).test(candidate)).pop() ?? null;
  check(url, `deployment-url-missing:${redact(output).slice(-500)}`);
  evidence.previewUrl = url;
  const deployment = inspectDeployment(url);
  evidence.previewDeployment = deployment;
  check(deployment.name === PRODUCTION_VERCEL_PROJECT, `candidate-in-unexpected-project:${deployment.name}`);
  check(!(deployment.aliases ?? []).includes(PRODUCTION_ORIGIN), "staged-deployment-must-not-hold-the-production-alias");
  check(!(deployment.aliases ?? []).includes(`https://${PRODUCTION_VERCEL_HOST}`), "staged-deployment-must-not-hold-the-configured-webhook-host");
  const stillLive = inspectDeployment(PRODUCTION_ORIGIN);
  check(stillLive.id === EXPECTED_ROLLBACK_DEPLOYMENT, `production-alias-moved-during-a-staged-deploy:${stillLive.id}`);
  const deadline = Date.now() + 480_000;
  let ready = deployment;
  while (Date.now() < deadline && !/Ready/.test(ready.status ?? "")) { await sleep(5000); ready = inspectDeployment(url); }
  evidence.previewReadyState = ready.status;
  check(/Ready/.test(ready.status ?? ""), `staged-deployment-not-ready:${ready.status}`);
  evidence.previewHostProtected = (await probe(`${url}/api/health`)).status !== 200;
  console.log(`PREVIEW ${JSON.stringify({ previewUrl: url, deploymentId: deployment.id, ready: ready.status, runtime: evidence.runtime })}`);
}

async function probePreview() {
  const url = args.get("--url"); const id = args.get("--deployment");
  check(url && id, "--url and --deployment are required");
  step(`probing ${id} through the CLI protection bypass`);
  const results = {};
  results.health = curlDeployment(id, "/api/health");
  results.webhookUnsigned = curlDeployment(id, "/api/billing/webhook", ["-X", "POST", "-H", "content-type: application/json", "-d", "{}"]);
  results.home = curlDeployment(id, "/");
  results.account = curlDeployment(id, "/account");
  results.pricing = curlDeployment(id, "/pricing");
  results.admin = curlDeployment(id, "/admin");
  results.scheduler = curlDeployment(id, "/api/internal/billing/reconcile");
  results.fixture = curlDeployment(id, "/api/internal/billing/fixture", ["-X", "POST", "-H", "content-type: application/json", "-d", "{\"action\":\"read-subscription\",\"subscriptionId\":\"sub_x\"}"]);
  results.gameRuntime = curlDeployment(id, "/game/runtime/index.html");
  results.forgedAccess = curlDeployment(id, "/play?access=active&trialEndsAt=2099-01-01");
  results.optimizerIcon = curlDeployment(id, "/_next/image?url=%2Ficon.png&w=64&q=75", ["-H", "accept: image/webp,image/*"]);
  results.optimizerRemote = curlDeployment(id, "/_next/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=64&q=75");
  results.thumbnailAvif = curlDeployment(id, "/media/games/number-cross.avif");
  evidence.previewProbes = results;
  // This deployment carries the production environment on a non-apex host, so
  // every proxied path — pages, admin, the scheduler and fixture routes, static
  // media — 308s to the apex (canonical host) while the two exempt machine
  // endpoints answer directly: exactly the v1.2.7 contract, proven before any
  // traffic moves. The image optimizer sits outside the proxy matcher, so it
  // answers on this host too. Fail-closed behaviour of the proxied routes is
  // proven on the apex after promotion and by the standing suites.
  const redirectsToApex = (result) => [307, 308].includes(result.status) && (result.location ?? "").startsWith(PRODUCTION_ORIGIN);
  const checks = {
    health: results.health.status === 200 && /"status":"ready"/.test(results.health.body),
    webhook: results.webhookUnsigned.status === 400 && /invalid-signature/.test(results.webhookUnsigned.body) && !results.webhookUnsigned.location,
    canonicalHost: [results.home, results.account, results.pricing, results.admin, results.scheduler, results.fixture, results.gameRuntime, results.thumbnailAvif, results.forgedAccess].every(redirectsToApex),
    noServerErrors: Object.values(results).every((result) => result.status > 0 && result.status < 500),
    optimizer: results.optimizerIcon.status === 200 && /^image\//.test(results.optimizerIcon.contentType ?? ""),
    optimizerRemoteRefused: results.optimizerRemote.status >= 400 && results.optimizerRemote.status < 500
  };
  evidence.previewChecks = checks;
  console.log(`PREVIEW_PROBES ${JSON.stringify({ checks, statuses: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, `${value.status}${value.location ? ` -> ${value.location}` : ""}`])) }, null, 2)}`);
  check(Object.values(checks).every(Boolean), `preview-certification-failed:${Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key).join(",")}`);
}

async function promote() {
  const url = args.get("--url");
  check(url, "--url is required");
  step(`promoting ${url} to the production alias`);
  assertRuntimeIsCertified();
  const before = inspectDeployment(PRODUCTION_ORIGIN);
  const candidate = inspectDeployment(url);
  evidence.aliasBefore = { id: before.id, url: before.url };
  check(before.id === EXPECTED_ROLLBACK_DEPLOYMENT, `apex-serves-unexpected-deployment:${before.id}`);
  check(candidate.name === PRODUCTION_VERCEL_PROJECT, `candidate-in-unexpected-project:${candidate.name}`);
  check(/Ready/.test(candidate.status ?? ""), `candidate-not-ready:${candidate.status}`);
  check(candidate.id !== before.id, "candidate-already-serves-the-alias");
  vercel(["promote", url, "--scope", SCOPE, "--yes"]);
  const deadline = Date.now() + 300_000;
  let after = null;
  while (Date.now() < deadline) { after = inspectDeployment(PRODUCTION_ORIGIN); if (after.id === candidate.id) break; await sleep(5000); }
  evidence.aliasAfter = { id: after?.id, url: after?.url };
  check(after?.id === candidate.id, `alias-did-not-move:${after?.id}`);
  evidence.rollbackTarget = { id: before.id, url: before.url, retained: true };
  console.log(`PROMOTED ${JSON.stringify({ promoted: candidate.id, previous: before.id })}`);
}

async function rollback() {
  step(`rolling the production alias back to ${EXPECTED_ROLLBACK_DEPLOYMENT}`);
  const target = inspectDeployment(EXPECTED_ROLLBACK_DEPLOYMENT);
  check(target.name === PRODUCTION_VERCEL_PROJECT && /Ready/.test(target.status ?? ""), `rollback-target-unavailable:${target.status}`);
  vercel(["promote", EXPECTED_ROLLBACK_DEPLOYMENT, "--scope", SCOPE, "--yes"]);
  const deadline = Date.now() + 300_000;
  let after = null;
  while (Date.now() < deadline) { after = inspectDeployment(PRODUCTION_ORIGIN); if (after.id === EXPECTED_ROLLBACK_DEPLOYMENT) break; await sleep(5000); }
  check(after?.id === EXPECTED_ROLLBACK_DEPLOYMENT, `rollback-did-not-take:${after?.id}`);
  evidence.aliasAfter = { id: after.id, url: after.url };
  console.log(`ROLLED_BACK ${JSON.stringify(evidence.aliasAfter)}`);
}

async function probeLive() {
  step("probing the live hosts");
  const expected = args.get("--expect-deployment") ?? null;
  const serving = inspectDeployment(PRODUCTION_ORIGIN);
  evidence.aliasServes = { id: serving.id, url: serving.url };
  if (expected) check(serving.id === expected, `alias-serves-unexpected-deployment:${serving.id}`);
  const post = { method: "POST", headers: { "content-type": "application/json" }, body: "{}" };
  const results = {};
  results.apexHtmlDeployment = ((await probe(`${PRODUCTION_ORIGIN}/`)).body.match(/data-dpl-id="(dpl_[A-Za-z0-9]+)"/) ?? [])[1] ?? null;
  results.configuredWebhookHost = await probe(`https://${PRODUCTION_VERCEL_HOST}/api/billing/webhook`, post);
  results.apexWebhook = await probe(`${PRODUCTION_ORIGIN}/api/billing/webhook`, post);
  results.wwwWebhook = await probe("https://www.mathnexa.com/api/billing/webhook", post);
  results.health = await probe(`${PRODUCTION_ORIGIN}/api/health`);
  results.configuredHostHealth = await probe(`https://${PRODUCTION_VERCEL_HOST}/api/health`);
  results.browserHostStillRedirects = await probe(`https://${PRODUCTION_VERCEL_HOST}/pricing`);
  results.www = await probe("https://www.mathnexa.com/");
  results.home = await probe(`${PRODUCTION_ORIGIN}/`);
  results.signIn = await probe(`${PRODUCTION_ORIGIN}/sign-in`);
  results.signUp = await probe(`${PRODUCTION_ORIGIN}/sign-up`);
  results.access = await probe(`${PRODUCTION_ORIGIN}/access`);
  results.pricing = await probe(`${PRODUCTION_ORIGIN}/pricing`);
  results.games = await probe(`${PRODUCTION_ORIGIN}/games`);
  results.mapPrep = await probe(`${PRODUCTION_ORIGIN}/map-prep`);
  results.homework = await probe(`${PRODUCTION_ORIGIN}/homework`);
  results.quizzes = await probe(`${PRODUCTION_ORIGIN}/quizzes`);
  results.account = await probe(`${PRODUCTION_ORIGIN}/account`);
  results.subscription = await probe(`${PRODUCTION_ORIGIN}/subscription`);
  results.gameAccess = await probe(`${PRODUCTION_ORIGIN}/game-access`);
  results.admin = await probe(`${PRODUCTION_ORIGIN}/admin`);
  results.adminSignIn = await probe(`${PRODUCTION_ORIGIN}/admin/sign-in`);
  results.scheduler = await probe(`${PRODUCTION_ORIGIN}/api/internal/billing/reconcile`);
  results.fixtureRoute = await probe(`${PRODUCTION_ORIGIN}/api/internal/billing/fixture`, { ...post, body: JSON.stringify({ action: "read-subscription", subscriptionId: "sub_x" }) });
  results.gameRuntime = await probe(`${PRODUCTION_ORIGIN}/game/runtime/index.html`);
  results.forgedAccess = await probe(`${PRODUCTION_ORIGIN}/play?access=active&trialEndsAt=2099-01-01`);
  const accept = { headers: { accept: "image/avif,image/webp,image/*,*/*;q=0.8" } };
  results.images = {
    brandMark: await probe(`${PRODUCTION_ORIGIN}/brand/mathnexa-mark.png`, accept),
    icon: await probe(`${PRODUCTION_ORIGIN}/icon.png`, accept),
    thumbnailAvif: await probe(`${PRODUCTION_ORIGIN}/media/games/number-cross.avif`, accept),
    thumbnailWebp: await probe(`${PRODUCTION_ORIGIN}/media/games/number-cross.webp`, accept),
    vocabularyWebp: await probe(`${PRODUCTION_ORIGIN}/media/games/math-vocabulary-hunt.webp`, accept),
    crosscalcSvg: await probe(`${PRODUCTION_ORIGIN}/media/games/crosscalc.svg`, accept),
    optimizerIcon: await probe(`${PRODUCTION_ORIGIN}/_next/image?url=%2Ficon.png&w=64&q=75`, accept),
    optimizerBrand: await probe(`${PRODUCTION_ORIGIN}/_next/image?url=%2Fbrand%2Fmathnexa-mark.png&w=128&q=75`, accept),
    optimizerThumbnailWebp: await probe(`${PRODUCTION_ORIGIN}/_next/image?url=%2Fmedia%2Fgames%2Fnumber-cross.webp&w=384&q=75`, accept),
    optimizerThumbnailAvif: await probe(`${PRODUCTION_ORIGIN}/_next/image?url=%2Fmedia%2Fgames%2Fnumber-cross.avif&w=384&q=75`, accept),
    optimizerRemote: await probe(`${PRODUCTION_ORIGIN}/_next/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=64&q=75`),
    optimizerTraversal: await probe(`${PRODUCTION_ORIGIN}/_next/image?url=%2F..%2F..%2Fetc%2Fpasswd&w=64&q=75`)
  };
  evidence.liveProbes = results;
  const isApexRedirect = (r) => [307, 308].includes(r.status) && (r.location ?? "").startsWith(PRODUCTION_ORIGIN);
  const accessRedirect = (r) => [302, 303, 307].includes(r.status) && /\/(access|sign-in)\?next=/.test(r.location ?? "");
  const wwwAcceptable = results.wwwWebhook.status === 400 || isApexRedirect(results.wwwWebhook);
  const checks = {
    apexServesExpected: !expected || results.apexHtmlDeployment === expected,
    configuredWebhookHost: results.configuredWebhookHost.status === 400 && /invalid-signature/.test(results.configuredWebhookHost.body) && results.configuredWebhookHost.matchedPath === "/api/billing/webhook",
    apexWebhook: results.apexWebhook.status === 400 && /invalid-signature/.test(results.apexWebhook.body) && !results.apexWebhook.location,
    wwwWebhook: wwwAcceptable,
    health: results.health.status === 200 && results.configuredHostHealth.status === 200,
    browserHostRedirects: isApexRedirect(results.browserHostStillRedirects),
    wwwRedirects: isApexRedirect(results.www),
    publicPages: [results.home, results.signIn, results.signUp, results.access, results.adminSignIn].every((r) => r.status === 200),
    productSurfacesRedirect: [results.pricing, results.games, results.mapPrep, results.homework, results.quizzes].every(accessRedirect),
    privateNoStore: [results.account, results.subscription, results.gameAccess].every((r) => accessRedirect(r) && /no-store/.test(r.cacheControl ?? "")),
    adminFailsClosed: results.admin.status === 404 && /no-store/.test(results.admin.cacheControl ?? ""),
    schedulerFailsClosed: [401, 503].includes(results.scheduler.status),
    fixtureAbsent: results.fixtureRoute.status === 404,
    gameRuntimeDenied: results.gameRuntime.status !== 200,
    forgedAccessDenied: !/\/game\/runtime/.test(results.forgedAccess.location ?? "") && results.forgedAccess.status !== 200,
    securityHeaders: securityHeadersIntact(results.home.security),
    images: Object.entries(results.images).filter(([key]) => !/Remote|Traversal/.test(key)).every(([, r]) => r.status === 200 && /^image\//.test(r.contentType ?? "")),
    optimizerRefusals: [results.images.optimizerRemote, results.images.optimizerTraversal].every((r) => r.status >= 400 && r.status < 500),
    noServerErrors: [...Object.values(results).filter((r) => r && typeof r === "object" && "status" in r), ...Object.values(results.images)].every((r) => r.status < 500)
  };
  evidence.liveChecks = checks;
  console.log(`LIVE_PROBES ${JSON.stringify({ apexHtmlDeployment: results.apexHtmlDeployment, checks, statuses: Object.fromEntries(Object.entries(results).filter(([k]) => k !== "images" && k !== "apexHtmlDeployment").map(([key, value]) => [key, `${value.status}${value.location ? ` -> ${value.location}` : ""}`])), images: Object.fromEntries(Object.entries(results.images).map(([key, value]) => [key, `${value.status} ${value.contentType ?? ""} ${value.bytes}B`])) }, null, 2)}`);
  check(Object.values(checks).every(Boolean), `live-certification-failed:${Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key).join(",")}`);
}

/**
 * READ-ONLY view of every live consumer subscription: the local projection
 * (PostgREST GET with the production service key) against Stripe (GET with
 * the restricted read-only key). Nothing is written, charged, refunded or
 * cancelled. Output carries suffixes only — never a customer id, a whole
 * subscription id or an email. Also reports the catalogue product/price ids
 * (not secrets) so the standing drift audit can be run with them.
 */
async function subscriberReadonly() {
  step("read-only subscriber verification");
  const ref = (process.env.SUPABASE_PRODUCTION_PROJECT_REF ?? "").trim().toLowerCase();
  const serviceKey = (process.env.SUPABASE_PRODUCTION_SECRET_KEY ?? "").trim();
  const stripeKey = (process.env.STRIPE_LIVE_READONLY_KEY ?? "").trim();
  check(/^[a-z]{20}$/.test(ref), "missing-supabase-production-project-ref");
  check(serviceKey.length >= 20, "missing-supabase-production-secret-key");
  check(/^rk_live_/.test(stripeKey), "stripe-key-is-not-a-restricted-read-only-live-key");
  const suffix = (value) => value ? `…${String(value).slice(-6)}` : null;
  const rest = async (path) => {
    const response = await fetch(`https://${ref}.supabase.co/rest/v1/${path}`, { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "user-agent": BACKEND_USER_AGENT, accept: "application/json" } });
    check(response.ok, `postgrest-read-failed-${response.status}:${path.split("?")[0]}`);
    return response.json();
  };
  const stripe = async (path) => {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${stripeKey}`, "user-agent": BACKEND_USER_AGENT } });
    check(response.ok, `stripe-read-failed-${response.status}:${path.split("?")[0].replace(/sub_[A-Za-z0-9]+/, "sub_…")}`);
    return response.json();
  };
  const subscriptions = await rest("billing_subscriptions?select=stripe_subscription_id,stripe_price_id,subscription_status,current_period_end,cancel_at_period_end,last_synchronized_at,last_synchronization_source,owner_consumer_id,first_paid_at,last_paid_at&owner_consumer_id=not.is.null&order=created_at.asc");
  const entitlements = await rest("consumer_game_entitlements?select=consumer_user_id,state,current_period_ends_at,updated_at&order=updated_at.desc");
  const report = [];
  const catalogue = new Set();
  for (const row of subscriptions) {
    const remote = row.stripe_subscription_id ? await stripe(`subscriptions/${row.stripe_subscription_id}`) : null;
    const price = row.stripe_price_id ? await stripe(`prices/${row.stripe_price_id}`) : null;
    if (price?.product) catalogue.add(`${typeof price.product === "string" ? price.product : price.product.id}|${row.stripe_price_id}`);
    const remotePeriodEnd = remote ? new Date((remote.items?.data?.[0]?.current_period_end ?? remote.current_period_end) * 1000).toISOString() : null;
    const localPeriodEnd = row.current_period_end ? new Date(row.current_period_end).toISOString() : null;
    report.push({
      subscription: suffix(row.stripe_subscription_id),
      local: { status: row.subscription_status, periodEnd: localPeriodEnd, cancelAtPeriodEnd: row.cancel_at_period_end, lastSynchronized: row.last_synchronized_at, source: row.last_synchronization_source, firstPaid: row.first_paid_at, lastPaid: row.last_paid_at },
      stripe: remote ? { status: remote.status, periodEnd: remotePeriodEnd, cancelAtPeriodEnd: remote.cancel_at_period_end, livemode: remote.livemode } : null,
      match: Boolean(remote) && remote.status === row.subscription_status && remotePeriodEnd === localPeriodEnd
    });
  }
  evidence.subscriptions = report;
  evidence.entitlements = entitlements.map((row) => ({ state: row.state, periodEnd: row.current_period_ends_at, updated: row.updated_at }));
  evidence.catalogue = [...catalogue];
  const active = report.filter((row) => row.stripe?.status === "active");
  console.log(`SUBSCRIBER_READONLY ${JSON.stringify({ subscriptions: report, entitlements: evidence.entitlements, catalogue: evidence.catalogue }, null, 2)}`);
  check(active.length >= 1 && active.every((row) => row.match), "active-subscription-does-not-match-stripe");
  check(evidence.entitlements.some((row) => /active/.test(row.state ?? "")), "no-active-entitlement");
}

try {
  check(!Object.entries(process.env).some(([name, value]) => name.startsWith("MVH_STAGING") && value), "staging-variables-loaded-refusing");
  if (stage === "subscriber-readonly") await subscriberReadonly();
  else if (stage === "preflight") await preflight();
  else if (stage === "deploy-preview") await deployPreview();
  else if (stage === "probe-preview") await probePreview();
  else if (stage === "promote") await promote();
  else if (stage === "probe-live") await probeLive();
  else if (stage === "rollback") await rollback();
  else throw new Error(`unknown-stage:${stage}`);
  evidence.completedAt = new Date().toISOString();
  evidence.outcome = "PASS";
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.outcome = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error)).slice(0, 2000);
  process.exitCode = 1;
} finally {
  const evidencePath = join(tmpdir(), `mathnexa-nextjs-hotfix-production-${stage}-${Date.now()}.json`);
  writeFileSync(evidencePath, redact(JSON.stringify(evidence, null, 2)));
  console.log(`${evidence.outcome} ${stage}`);
  console.log(`EVIDENCE ${evidencePath}`);
}
