import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import {
  buildPhase7dEnvironment,
  PHASE7D_BASELINE,
  PHASE7D_PROTECTED_HASHES,
  PHASE7D_RESEND_DOMAIN,
  PHASE7D_RESEND_SENDER,
  PHASE7D_STAGING_ORIGIN,
  PHASE7D_STRIPE_API_VERSION,
  PHASE7D_STRIPE_EVENTS,
  PHASE7D_STRIPE_PORTAL_ID,
  PHASE7D_STRIPE_PRICE_ID,
  PHASE7D_STRIPE_PRODUCT_ID,
  PHASE7D_SUPABASE_ORGANIZATION_ID,
  PHASE7D_SUPABASE_PROJECT_NAME,
  PHASE7D_SUPABASE_REGION,
  PHASE7D_SYNTHETIC_TABLES,
  PHASE7D_VERCEL_PROJECT_NAME,
  PHASE7D_VERCEL_SCOPE,
  redactPhase7dText
} from "./phase7d-hosted-contract.mjs";
import { runPhase7dHostedLifecycle } from "./phase7d-hosted-lifecycle.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseCli = resolve(repositoryRoot, "node_modules/supabase/dist/supabase.js");
const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const vercelCli = process.env.PHASE7D_VERCEL_CLI ?? "";
const stateRoot = resolve(process.env.LOCALAPPDATA ?? tmpdir(), "MathNexa");
const statePath = resolve(stateRoot, "phase7d-staging-state.json");
const resultPath = resolve(repositoryRoot, "test-results/phase7d-hosted-result.json");
const workRoot = resolve(tmpdir(), `mathnexa-phase7d-${process.pid}`);
const secrets = [];
let lifecycle = null;
let projectRef = null;
let supabaseWorkRoot = null;

function required(name, pattern) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`invalid-${name.toLowerCase().replaceAll("_", "-")}`);
  secrets.push(value);
  return value;
}

const supabaseAccessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_[A-Za-z0-9_-]{16,}$/);
const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{32,}$/);
const resendApiKey = required("RESEND_API_KEY", /^re_[A-Za-z0-9_-]{16,}$/);
const stripePublishableKey = required("STRIPE_PUBLISHABLE_KEY", /^pk_test_[A-Za-z0-9_]{8,}$/);
const stripeSecretKey = required("STRIPE_SECRET_KEY", /^sk_test_[A-Za-z0-9_]{8,}$/);
if (!vercelCli || !existsSync(vercelCli)) throw new Error("authenticated-vercel-cli-unavailable");

function log(message) {
  process.stdout.write(`${message}\n`);
}

function loadState() {
  if (!existsSync(statePath)) return { version: 1 };
  try { return JSON.parse(readFileSync(statePath, "utf8")); }
  catch { throw new Error("phase7d-state-invalid"); }
}

function saveState(state) {
  mkdirSync(stateRoot, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function saveVaultSecret(name, value) {
  secrets.push(value);
  const script = process.env.PHASE7D_VAULT_UPDATE_SCRIPT ?? "";
  if (!script || !existsSync(script)) throw new Error("phase7d-vault-update-unavailable");
  const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Name", name], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, PHASE7D_VAULT_SECRET_VALUE: value },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error(`phase7d-vault-update-${name.toLowerCase()}`);
  process.env[name] = value;
}

async function providerJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* Status is sufficient. */ }
  if (!response.ok) {
    const code = body?.error?.code ?? body?.code ?? `http-${response.status}`;
    throw new Error(`provider-api-${String(code).replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`);
  }
  return body;
}

const supabaseHeaders = {
  Authorization: `Bearer ${supabaseAccessToken}`,
  "content-type": "application/json"
};

async function supabaseJson(path, options = {}) {
  return providerJson(`https://api.supabase.com${path}`, {
    ...options,
    headers: { ...supabaseHeaders, ...(options.headers ?? {}) }
  });
}

async function resendJson(path) {
  return providerJson(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${resendApiKey}`, Accept: "application/json" }
  });
}

function vercel(args, { input = null, allowFailure = false } = {}) {
  const result = spawnSync(vercelCli, [...args, "--scope", PHASE7D_VERCEL_SCOPE], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: input === null ? undefined : JSON.stringify(input),
    stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
    env: process.env
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`vercel-cli-failed:${redactPhase7dText(`${result.stdout}\n${result.stderr}`, secrets)}`);
  }
  return result;
}

function parseJsonOutput(value, code) {
  const text = String(value ?? "").trim();
  const start = Math.min(...[text.indexOf("{"), text.indexOf("[")].filter((index) => index >= 0));
  try { return JSON.parse(start >= 0 ? text.slice(start) : text); }
  catch { throw new Error(code); }
}

function getVercelProject(name, allowMissing = false) {
  const result = vercel(["api", `/v9/projects/${name}`, "--raw"], { allowFailure: allowMissing });
  if (result.status !== 0 && allowMissing) return null;
  return parseJsonOutput(result.stdout, "vercel-project-response-invalid");
}

function upsertVercelEnvironment(values) {
  const payload = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    type: "sensitive",
    target: ["preview"]
  }));
  vercel([
    "api", `/v10/projects/${PHASE7D_VERCEL_PROJECT_NAME}/env?upsert=true`,
    "--method", "POST", "--input", "-", "--silent"
  ], { input: payload });
}

function findSecret(value) {
  if (typeof value === "string" && /^[A-Za-z0-9]{24,}$/.test(value)) return value;
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (/secret/i.test(key) && typeof child === "string" && child.length >= 24) return child;
  }
  for (const child of Object.values(value)) {
    const found = findSecret(child);
    if (found) return found;
  }
  return null;
}

function supabaseCommand(args) {
  const result = spawnSync(process.execPath, [supabaseCli, ...args, "--workdir", supabaseWorkRoot, "--yes"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: supabaseAccessToken,
      SUPABASE_DB_PASSWORD: databasePassword,
      SUPABASE_TELEMETRY_DISABLED: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`supabase-cli-failed:${redactPhase7dText(`${result.stdout}\n${result.stderr}`, secrets)}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

async function waitFor(label, read, accept, timeout = 300_000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (await accept(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${label}-timed-out`);
}

async function provisionSupabase(state) {
  const projects = await supabaseJson("/v1/projects");
  const matches = projects.filter((project) => project.name === PHASE7D_SUPABASE_PROJECT_NAME);
  if (matches.length > 1) throw new Error("duplicate-supabase-staging-project");
  let project = matches[0] ?? null;
  let action = "reused";
  if (!project) {
    project = await supabaseJson("/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: PHASE7D_SUPABASE_PROJECT_NAME,
        organization_id: PHASE7D_SUPABASE_ORGANIZATION_ID,
        db_pass: databasePassword,
        region: PHASE7D_SUPABASE_REGION,
        plan: "free"
      })
    });
    action = "created";
  }
  projectRef = project.ref;
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("supabase-staging-ref-invalid");
  if (projectRef === "ioodoktlxvvmghyvevgn") throw new Error("supabase-preview-collision");
  const healthy = await waitFor("supabase-project-healthy", () => supabaseJson(`/v1/projects/${projectRef}`),
    (value) => value.status === "ACTIVE_HEALTHY");
  if (healthy.region && !String(healthy.region).includes("us-east")) throw new Error("supabase-staging-region-mismatch");

  const keys = await supabaseJson(`/v1/projects/${projectRef}/api-keys?reveal=true`);
  const valueOf = (key) => key.api_key ?? key.key ?? key.value ?? "";
  const publishable = keys.find((key) => key.type === "publishable") ?? keys.find((key) => key.name === "anon");
  const secret = keys.find((key) => key.type === "secret") ?? keys.find((key) => key.name === "service_role");
  const publishableKey = valueOf(publishable);
  const secretKey = valueOf(secret);
  if (publishableKey.length < 20 || secretKey.length < 20) throw new Error("supabase-staging-keys-unavailable");
  saveVaultSecret("SUPABASE_PUBLISHABLE_KEY", publishableKey);
  saveVaultSecret("SUPABASE_SECRET_KEY", secretKey);

  supabaseWorkRoot = resolve(workRoot, "supabase-work");
  mkdirSync(supabaseWorkRoot, { recursive: true });
  cpSync(resolve(repositoryRoot, "supabase"), resolve(supabaseWorkRoot, "supabase"), { recursive: true });
  supabaseCommand(["link", "--project-ref", projectRef]);
  const migrationOutput = supabaseCommand(["db", "push", "--linked", "--include-all"]);
  const lintOutput = supabaseCommand(["db", "lint", "--linked"]);
  const tapOutput = supabaseCommand(["test", "db", "--linked"]);
  state.supabase = {
    action,
    projectRef,
    region: healthy.region ?? PHASE7D_SUPABASE_REGION,
    status: "ACTIVE_HEALTHY",
    migrationsFromEmpty: action === "created",
    migrationGate: /Finished supabase db push|up to date|Applied migration/i.test(migrationOutput),
    lintGate: !/error:/i.test(lintOutput),
    pgTapGate: /Result: PASS|All tests successful|Files=\d+, Tests=\d+/i.test(tapOutput),
    pgTapSummary: (tapOutput.match(/Files=\d+, Tests=\d+[^\r\n]*/i) ?? ["passed"])[0]
  };
  saveState(state);
  log(`Phase 7D Supabase ${action}; migrations, lint, and pgTAP passed.`);
  return { publishableKey, secretKey, url: `https://${projectRef}.supabase.co` };
}

async function verifyResend(state) {
  const response = await resendJson("/domains");
  const domains = Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : [];
  const matches = domains.filter((domain) => domain.name === PHASE7D_RESEND_DOMAIN);
  if (matches.length !== 1) throw new Error(matches.length === 0 ? "resend-sender-domain-unavailable" : "duplicate-resend-sender-domain");
  const domain = matches[0];
  if (domain.status !== "verified") throw new Error("resend-sender-domain-not-verified");
  state.email = { domainId: domain.id, domain: domain.name, action: "reused", status: "verified", sender: PHASE7D_RESEND_SENDER };
  saveState(state);
  log("Phase 7D transactional sender domain reconciled and verified.");
}

async function provisionVercel(state) {
  let project = getVercelProject(PHASE7D_VERCEL_PROJECT_NAME, true);
  let action = "reused";
  if (!project) {
    vercel(["project", "add", PHASE7D_VERCEL_PROJECT_NAME]);
    action = "created";
    project = getVercelProject(PHASE7D_VERCEL_PROJECT_NAME);
  }
  if (project.name !== PHASE7D_VERCEL_PROJECT_NAME) throw new Error("vercel-staging-project-mismatch");
  vercel([
    "api", `/v9/projects/${PHASE7D_VERCEL_PROJECT_NAME}`,
    "--method", "PATCH", "--input", "-", "--silent"
  ], { input: {
    framework: "nextjs",
    rootDirectory: "apps/platform-web",
    sourceFilesOutsideRootDirectory: true,
    nodeVersion: "24.x",
    gitForkProtection: true,
    autoExposeSystemEnvs: true
  } });
  vercel(["project", "protection", "enable", PHASE7D_VERCEL_PROJECT_NAME, "--sso", "--json"]);
  project = getVercelProject(PHASE7D_VERCEL_PROJECT_NAME);
  if (project.ssoProtection?.deploymentType !== "all_except_custom_domains") throw new Error("vercel-standard-protection-not-enabled");

  let bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
  const bypassEntries = Object.keys(project.protectionBypass ?? {});
  if (!bypass) {
    if (bypassEntries.length > 0) throw new Error("vercel-bypass-secret-unrecoverable");
    const created = vercel([
      "project", "protection", "enable", PHASE7D_VERCEL_PROJECT_NAME,
      "--protection-bypass", "--json"
    ]);
    const parsed = parseJsonOutput(created.stdout, "vercel-bypass-response-invalid");
    bypass = findSecret(parsed) ?? "";
    if (bypass.length < 24) throw new Error("vercel-bypass-secret-unavailable");
    saveVaultSecret("VERCEL_AUTOMATION_BYPASS_SECRET", bypass);
  } else if (bypassEntries.length !== 1) {
    throw new Error("vercel-bypass-resource-conflict");
  }
  state.vercel = {
    action,
    projectId: project.id,
    projectName: project.name,
    environment: "preview",
    standardProtection: true,
    bypassCount: 1,
    origin: PHASE7D_STAGING_ORIGIN
  };
  saveState(state);
  log(`Phase 7D Vercel project ${action}; Standard Protection is enabled.`);
  return { bypass, projectId: project.id };
}

async function provisionStripe(state, bypass) {
  const stripe = new Stripe(stripeSecretKey, { apiVersion: PHASE7D_STRIPE_API_VERSION });
  const [product, price, portal] = await Promise.all([
    stripe.products.retrieve(PHASE7D_STRIPE_PRODUCT_ID),
    stripe.prices.retrieve(PHASE7D_STRIPE_PRICE_ID),
    stripe.billingPortal.configurations.retrieve(PHASE7D_STRIPE_PORTAL_ID)
  ]);
  if (product.livemode || price.livemode || portal.livemode || !product.active || !price.active || !portal.active ||
    price.product !== product.id || price.currency !== "usd" || price.unit_amount !== 599 ||
    price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) {
    throw new Error("stripe-sandbox-resource-contract-mismatch");
  }
  const url = `${PHASE7D_STAGING_ORIGIN}/api/billing/webhook?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const matches = endpoints.data.filter((endpoint) =>
    endpoint.metadata?.application === "mathnexa" && endpoint.metadata?.environment === "staging" && endpoint.metadata?.phase === "7d"
  );
  if (matches.length > 1) throw new Error("duplicate-stripe-staging-webhook");
  let endpoint = matches[0] ?? null;
  let action = "reused";
  let webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (endpoint) {
    if (endpoint.url !== url || endpoint.livemode || endpoint.status !== "enabled") throw new Error("stripe-staging-webhook-conflict");
    if (!webhookSecret) throw new Error("stripe-staging-webhook-secret-unrecoverable");
  } else {
    endpoint = await stripe.webhookEndpoints.create({
      url,
      enabled_events: PHASE7D_STRIPE_EVENTS,
      api_version: PHASE7D_STRIPE_API_VERSION,
      description: "MathNexa Phase 7D isolated staging (Stripe Sandbox only)",
      metadata: { application: "mathnexa", environment: "staging", phase: "7d" }
    });
    webhookSecret = endpoint.secret ?? "";
    if (!webhookSecret.startsWith("whsec_")) throw new Error("stripe-staging-webhook-secret-unavailable");
    saveVaultSecret("STRIPE_WEBHOOK_SECRET", webhookSecret);
    action = "created";
  }
  const enabled = new Set(endpoint.enabled_events);
  if (PHASE7D_STRIPE_EVENTS.some((event) => !enabled.has(event))) throw new Error("stripe-staging-webhook-events-incomplete");
  state.stripe = {
    productId: product.id,
    productAction: "reused",
    priceId: price.id,
    priceAction: "reused",
    portalId: portal.id,
    portalAction: "reused",
    webhookId: endpoint.id,
    webhookAction: action,
    mode: "test",
    amount: 599,
    currency: "usd",
    interval: "month"
  };
  saveState(state);
  log(`Phase 7D Stripe Sandbox resources reconciled; webhook ${action}.`);
  return { webhookSecret };
}

async function configureSupabaseAuth(supabase, state) {
  const allowed = [
    `${PHASE7D_STAGING_ORIGIN}/auth/callback`,
    `${PHASE7D_STAGING_ORIGIN}/auth/callback?next=/account`,
    `${PHASE7D_STAGING_ORIGIN}/auth/callback?next=/update-password`
  ].join(",");
  await supabaseJson(`/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({
      site_url: PHASE7D_STAGING_ORIGIN,
      uri_allow_list: allowed,
      disable_signup: false,
      external_email_enabled: true,
      external_phone_enabled: false,
      external_anonymous_users_enabled: false,
      mailer_autoconfirm: false,
      mailer_allow_unverified_email_sign_ins: false,
      security_manual_linking_enabled: false,
      security_refresh_token_rotation_enabled: true,
      security_refresh_token_reuse_interval: 10,
      jwt_exp: 3600,
      smtp_admin_email: PHASE7D_RESEND_SENDER,
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_pass: resendApiKey,
      smtp_sender_name: "MathNexa",
      smtp_max_frequency: 60,
      mailer_subjects_confirmation: "Confirm your MathNexa account",
      mailer_subjects_recovery: "Reset your MathNexa password"
    })
  });
  const auth = await supabaseJson(`/v1/projects/${projectRef}/config/auth`);
  if (auth.site_url !== PHASE7D_STAGING_ORIGIN || auth.mailer_autoconfirm !== false ||
    auth.external_email_enabled !== true || auth.external_anonymous_users_enabled === true ||
    auth.smtp_host !== "smtp.resend.com" || auth.smtp_admin_email !== PHASE7D_RESEND_SENDER) {
    throw new Error("supabase-auth-configuration-verification");
  }
  const admin = createClient(supabase.url, supabase.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
  if (identity.error) throw new Error("supabase-consumer-identity-mode-failed");
  state.supabase.auth = {
    siteUrl: PHASE7D_STAGING_ORIGIN,
    emailPassword: true,
    emailConfirmationRequired: true,
    anonymous: false,
    phone: false,
    sender: PHASE7D_RESEND_SENDER,
    identityModel: "consumer-v1"
  };
  saveState(state);
  log("Phase 7D Supabase Auth and custom SMTP configuration verified.");
}

function deployVercel(state) {
  const result = vercel([
    "deploy", ".", "--project", PHASE7D_VERCEL_PROJECT_NAME,
    "--target", "preview", "--yes", "--json"
  ]);
  const deployment = parseJsonOutput(result.stdout, "vercel-deployment-response-invalid");
  const deploymentUrl = String(deployment.url ?? "").startsWith("http") ? deployment.url : `https://${deployment.url}`;
  if (!deployment.id || !deploymentUrl.includes(".vercel.app")) throw new Error("vercel-deployment-invalid");
  const project = getVercelProject(PHASE7D_VERCEL_PROJECT_NAME);
  const preview = project.targets?.preview ?? project.latestDeployments?.[0];
  if (preview?.readyState !== "READY" || !(preview.alias ?? []).includes(new URL(PHASE7D_STAGING_ORIGIN).hostname)) {
    throw new Error("vercel-staging-alias-not-ready");
  }
  state.vercel.deploymentId = preview.id;
  state.vercel.deploymentUrl = `https://${preview.url}`;
  state.vercel.alias = PHASE7D_STAGING_ORIGIN;
  saveState(state);
  return preview.id;
}

async function verifyVercelProtection(bypass) {
  const anonymous = await fetch(PHASE7D_STAGING_ORIGIN, { redirect: "manual" });
  if (![302, 307, 401, 403].includes(anonymous.status)) throw new Error("vercel-staging-anonymous-access-not-protected");
  const automated = await fetch(PHASE7D_STAGING_ORIGIN, {
    headers: { "x-vercel-protection-bypass": bypass }, redirect: "manual"
  });
  if (automated.status !== 200) throw new Error("vercel-staging-automation-bypass-failed");
}

async function cleanupHosted(state, lifecycleError = null) {
  const resources = lifecycle?.resources ?? lifecycleError?.phase7dResources;
  const admin = lifecycle?.admin ?? lifecycleError?.phase7dAdmin;
  const stripe = lifecycle?.stripe ?? lifecycleError?.phase7dStripe ?? new Stripe(stripeSecretKey, { apiVersion: PHASE7D_STRIPE_API_VERSION });
  const failures = [];
  if (resources) {
    for (const subscriptionId of resources.subscriptionIds) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (subscription.status !== "canceled") await stripe.subscriptions.cancel(subscriptionId);
      } catch (error) {
        if (error?.code !== "resource_missing") failures.push("subscription-cleanup");
      }
    }
    for (const clockId of resources.clockIds) {
      try {
        const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
        if (clock.status === "advancing") {
          await waitFor("cleanup-clock-ready", () => stripe.testHelpers.testClocks.retrieve(clockId), (value) => value.status === "ready");
        }
        await stripe.testHelpers.testClocks.del(clockId);
      } catch (error) {
        if (error?.code !== "resource_missing") failures.push("clock-cleanup");
      }
    }
    for (const customerId of resources.customerIds) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (!("deleted" in customer && customer.deleted)) await stripe.customers.del(customerId);
      } catch (error) {
        if (error?.code !== "resource_missing") failures.push("customer-cleanup");
      }
    }
    if (admin) {
      for (const userId of resources.userIds) {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error && !/not found/i.test(deleted.error.message)) failures.push("auth-user-cleanup");
      }
    }
  }
  if (supabaseWorkRoot && projectRef) {
    supabaseCommand(["db", "reset", "--linked", "--no-seed"]);
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const url = `https://${projectRef}.supabase.co`;
    const finalAdmin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const identity = await finalAdmin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
    if (identity.error) failures.push("identity-mode-cleanup");
    const users = await finalAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (users.error || users.data.users.length !== 0) failures.push("auth-users-not-zero");
    const tableCounts = {};
    for (const table of PHASE7D_SYNTHETIC_TABLES) {
      const result = await finalAdmin.from(table).select("*", { count: "exact", head: true });
      tableCounts[table] = result.count;
      if (result.error || result.count !== 0) failures.push(`${table}-not-zero`);
    }
    const customers = await stripe.customers.search({ query: "metadata['phase']:'7d' AND metadata['environment']:'staging'", limit: 100 });
    const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
    const phaseClocks = clocks.data.filter((clock) => clock.name?.startsWith("MathNexa phase7d "));
    state.cleanup = {
      authUsers: users.data?.users?.length ?? null,
      tableCounts,
      activeStripeCustomers: customers.data.length,
      testClocks: phaseClocks.length,
      failures
    };
  } else {
    failures.push("staging-database-cleanup-unavailable");
  }
  saveState(state);
  if (failures.length > 0) throw new Error(`phase7d-cleanup-failed-${failures.join("-")}`);
  log("Phase 7D synthetic Auth, application, Stripe Customer, and Test Clock cleanup-to-zero passed.");
}

function protectedHashes() {
  for (const [path, expected] of Object.entries(PHASE7D_PROTECTED_HASHES)) {
    const actual = createHash("sha256").update(readFileSync(resolve(repositoryRoot, path))).digest("hex").toUpperCase();
    if (actual !== expected) throw new Error(`protected-hash-changed-${path.replaceAll("/", "-")}`);
  }
}

async function main() {
  const gitStatus = execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" });
  if (gitStatus.trim()) throw new Error("phase7d-hosted-run-requires-clean-worktree");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const baselineAncestor = spawnSync("git", ["merge-base", "--is-ancestor", PHASE7D_BASELINE, commit], { cwd: repositoryRoot });
  if (baselineAncestor.status !== 0) throw new Error("phase7d-baseline-not-ancestor");
  protectedHashes();
  mkdirSync(workRoot, { recursive: true });
  const state = loadState();
  state.version = 1;
  state.commit = commit;
  state.startedAt = new Date().toISOString();
  state.status = "running";
  saveState(state);

  const supabase = await provisionSupabase(state);
  await verifyResend(state);
  const vercelResource = await provisionVercel(state);
  const stripeResource = await provisionStripe(state, vercelResource.bypass);
  await configureSupabaseAuth({ ...supabase, secretKey: supabase.secretKey }, state);
  const environment = buildPhase7dEnvironment({
    supabaseUrl: supabase.url,
    supabasePublishableKey: supabase.publishableKey,
    supabaseSecretKey: supabase.secretKey,
    supabaseProjectRef: projectRef,
    stripePublishableKey,
    stripeSecretKey,
    stripeWebhookSecret: stripeResource.webhookSecret,
    buildId: commit.slice(0, 40),
    emailVerified: false
  });
  upsertVercelEnvironment(environment);
  deployVercel(state);
  await verifyVercelProtection(vercelResource.bypass);
  log("Phase 7D protected staging deployment is Ready; hosted lifecycle started.");

  let lifecycleError = null;
  try {
    lifecycle = await runPhase7dHostedLifecycle({
      supabaseUrl: supabase.url,
      supabaseSecretKey: supabase.secretKey,
      stripeSecretKey,
      webhookSecret: stripeResource.webhookSecret,
      bypassSecret: vercelResource.bypass,
      resendApiKey
    });
    state.lifecycle = lifecycle.evidence;
    saveState(state);
  } catch (error) {
    lifecycleError = error;
    throw error;
  } finally {
    await cleanupHosted(state, lifecycleError);
  }

  upsertVercelEnvironment(buildPhase7dEnvironment({
    supabaseUrl: supabase.url,
    supabasePublishableKey: supabase.publishableKey,
    supabaseSecretKey: supabase.secretKey,
    supabaseProjectRef: projectRef,
    stripePublishableKey,
    stripeSecretKey,
    stripeWebhookSecret: stripeResource.webhookSecret,
    buildId: commit.slice(0, 40),
    emailVerified: true
  }));
  deployVercel(state);
  await verifyVercelProtection(vercelResource.bypass);
  protectedHashes();
  state.status = "passed";
  state.completedAt = new Date().toISOString();
  state.publicDomainMoved = false;
  state.protectedPreviewChanged = false;
  state.liveStripeUsed = false;
  saveState(state);
  mkdirSync(resolve(repositoryRoot, "test-results"), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify({
    passed: true,
    commit,
    supabase: state.supabase,
    vercel: state.vercel,
    email: state.email,
    stripe: state.stripe,
    lifecycle: state.lifecycle,
    cleanup: state.cleanup,
    protectedHashes: PHASE7D_PROTECTED_HASHES
  }, null, 2)}\n`, "utf8");
  log("Phase 7D hosted staging verification passed. Public Production and protected Preview were not changed.");
}

let outcome = null;
try {
  await main();
  outcome = { passed: true };
} catch (error) {
  const message = error instanceof Error ? redactPhase7dText(error.message, secrets) : "phase7d-hosted-failed";
  outcome = { passed: false, blocker: message };
  mkdirSync(resolve(repositoryRoot, "test-results"), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  process.stderr.write(`Phase 7D stopped: ${message}\n`);
  process.exitCode = 1;
} finally {
  for (const name of [
    "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "RESEND_API_KEY",
    "STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "VERCEL_AUTOMATION_BYPASS_SECRET"
  ]) delete process.env[name];
  rmSync(workRoot, { recursive: true, force: true });
}
