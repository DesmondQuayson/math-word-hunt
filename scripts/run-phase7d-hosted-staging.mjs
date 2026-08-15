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
  buildPhase7dHostedStateVerificationSql,
  buildPhase7dVercelDeployArgs,
  buildVercelProductionEnvironmentPayloads,
  evaluatePhase7dVercelDeployment,
  hasNoPhase7dCustomDomains,
  inspectPhase7dVercelEnvironment,
  isPhase7dVercelDeploymentSource,
  isPhase7dVercelLocalLink,
  isVercelStandardProtectionScope,
  PHASE7D_BASELINE,
  PHASE7D_BRANCH,
  PHASE7D_PROTECTED_PREVIEW_VERCEL_PROJECT_ID,
  PHASE7D_PROTECTED_HASHES,
  PHASE7D_PUBLIC_VERCEL_PROJECT_ID,
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
  PHASE7D_VERCEL_PROJECT_ID,
  PHASE7D_VERCEL_SCOPE,
  PHASE7D_VERCEL_TEAM_ID,
  recoverVercelAutomationBypassSecret,
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
let resendProvisioningKeyId = null;

function required(name, pattern) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`invalid-${name.toLowerCase().replaceAll("_", "-")}`);
  secrets.push(value);
  return value;
}

const supabaseAccessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_[A-Za-z0-9_-]{16,}$/);
const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{32,}$/);
let resendProvisioningApiKey = required("RESEND_PROVISIONING_API_KEY", /^re_[A-Za-z0-9_-]{16,}$/);
const stripePublishableKey = required("STRIPE_PUBLISHABLE_KEY", /^pk_test_[A-Za-z0-9_]{8,}$/);
const stripeSecretKey = required("STRIPE_SECRET_KEY", /^sk_test_[A-Za-z0-9_]{8,}$/);
const stagingAccessToken = required("MVH_STAGING_ACCESS_TOKEN", /^[A-Za-z0-9_-]{43}$/);
if (!vercelCli || !existsSync(vercelCli)) throw new Error("authenticated-vercel-cli-unavailable");

function log(message) {
  process.stdout.write(`${message}\n`);
}

function spawnVercel(args, options = {}) {
  const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : vercelCli;
  const invocation = process.platform === "win32" ? ["/d", "/s", "/c", vercelCli, ...args] : args;
  return spawnSync(executable, invocation, options);
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

function removeVaultSecret(name) {
  const script = process.env.PHASE7D_VAULT_REMOVE_SCRIPT ?? "";
  if (!script || !existsSync(script)) throw new Error("phase7d-vault-remove-unavailable");
  const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Name", name], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error(`phase7d-vault-remove-${name.toLowerCase()}`);
  delete process.env[name];
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

const resendErrorTypes = new Set([
  "invalid_idempotency_key", "validation_error", "missing_api_key", "restricted_api_key", "invalid_api_key",
  "not_found", "method_not_allowed", "invalid_idempotent_request", "concurrent_idempotent_requests",
  "invalid_attachment", "invalid_from_address", "invalid_access", "invalid_parameter", "invalid_region",
  "missing_required_field", "monthly_quota_exceeded", "daily_quota_exceeded", "rate_limit_exceeded",
  "security_error", "application_error", "internal_server_error"
]);

async function resendJson(path, options = {}) {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${resendProvisioningApiKey}`,
      Accept: "application/json",
      "content-type": "application/json",
      "user-agent": "MathNexa-Phase7D/1.0",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* The status and documented type gate remain authoritative. */ }
  if (!response.ok) {
    const candidate = String(body?.name ?? body?.type ?? "application_error");
    throw new Error(`resend-error:${resendErrorTypes.has(candidate) ? candidate : "application_error"}`);
  }
  return body;
}

async function validateProviderAuthentication() {
  const stripe = new Stripe(stripeSecretKey, { apiVersion: PHASE7D_STRIPE_API_VERSION });
  const vercelIdentity = spawnVercel(["whoami"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  if (vercelIdentity.status !== 0 || !vercelIdentity.stdout.trim()) throw new Error("vercel-authentication-unavailable");
  let projects;
  let domains;
  let product;
  let price;
  let portal;
  try { projects = await supabaseJson("/v1/projects"); }
  catch { throw new Error("supabase-authentication-rejected"); }
  const resendValidationStarted = Date.now() - 5_000;
  try {
    domains = await resendJson("/domains");
    const key = await waitFor("resend-provisioning-key-identity", async () => {
      const response = await resendJson("/api-keys");
      const candidates = (response?.data ?? []).filter((item) =>
        item.last_used_at && Date.parse(item.last_used_at) >= resendValidationStarted
      );
      if (candidates.length > 1) throw new Error("resend-provisioning-key-identity-conflict");
      return candidates[0] ?? null;
    }, Boolean, 30_000);
    resendProvisioningKeyId = key.id;
  } catch (error) {
    const type = error instanceof Error && error.message.startsWith("resend-error:")
      ? error.message.slice("resend-error:".length)
      : null;
    throw new Error(type && resendErrorTypes.has(type) ? type : "application_error");
  }
  try {
    [product, price, portal] = await Promise.all([
      stripe.products.retrieve(PHASE7D_STRIPE_PRODUCT_ID),
      stripe.prices.retrieve(PHASE7D_STRIPE_PRICE_ID),
      stripe.billingPortal.configurations.retrieve(PHASE7D_STRIPE_PORTAL_ID)
    ]);
  } catch { throw new Error("stripe-sandbox-authentication-rejected"); }
  if (!Array.isArray(projects) || (!Array.isArray(domains?.data) && !Array.isArray(domains)) ||
    product.livemode || price.livemode || portal.livemode) {
    throw new Error("phase7d-provider-authentication-verification");
  }
  log("Phase 7D provider credentials authenticated read-only; mutations remain disabled until vault validation.");
}

function vercel(args, { input = null, allowFailure = false } = {}) {
  const result = spawnVercel([...args, "--scope", PHASE7D_VERCEL_SCOPE], {
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
  for (const payload of buildVercelProductionEnvironmentPayloads(values)) {
    vercel([
      "api", `/v10/projects/${PHASE7D_VERCEL_PROJECT_NAME}/env?upsert=true`,
      "--method", "POST", "--input", "-", "--silent"
    ], { input: payload });
  }
}

function getVercelEnvironmentEntries() {
  const result = vercel([
    "api", `/v9/projects/${PHASE7D_VERCEL_PROJECT_NAME}/env`, "--raw"
  ]);
  const parsed = parseJsonOutput(result.stdout, "vercel-environment-response-invalid");
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.envs)) return parsed.envs;
  if (Array.isArray(parsed.data)) return parsed.data;
  throw new Error("vercel-environment-response-invalid");
}

function listVercelDeployments(projectId = PHASE7D_VERCEL_PROJECT_ID) {
  const result = vercel([
    "api", `/v6/deployments?projectId=${projectId}`, "--raw"
  ]);
  const parsed = parseJsonOutput(result.stdout, "vercel-deployments-response-invalid");
  if (!Array.isArray(parsed.deployments)) throw new Error("vercel-deployments-response-invalid");
  return parsed.deployments;
}

function getVercelProjectDomains() {
  const result = vercel(["api", `/v9/projects/${PHASE7D_VERCEL_PROJECT_ID}/domains`, "--raw"]);
  const parsed = parseJsonOutput(result.stdout, "vercel-project-domains-response-invalid");
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.domains) ? parsed.domains : [];
}

function getVercelDeployment(id) {
  const result = vercel(["api", `/v13/deployments/${encodeURIComponent(id)}`, "--raw"]);
  return parseJsonOutput(result.stdout, "vercel-deployment-metadata-invalid");
}

async function captureExternalIsolationBaseline() {
  const publicDeployment = listVercelDeployments(PHASE7D_PUBLIC_VERCEL_PROJECT_ID)[0];
  const previewDeployment = listVercelDeployments(PHASE7D_PROTECTED_PREVIEW_VERCEL_PROJECT_ID)[0];
  if (!publicDeployment || !previewDeployment) throw new Error("phase7d-isolation-baseline-unavailable");
  const publicResponse = await fetch("https://mathnexa.com", { redirect: "manual", cache: "no-store" });
  if (publicResponse.status !== 200) throw new Error("phase7d-public-production-baseline-unhealthy");
  return Object.freeze({
    publicDeploymentId: publicDeployment.uid ?? publicDeployment.id,
    protectedPreviewDeploymentId: previewDeployment.uid ?? previewDeployment.id,
    publicStatus: publicResponse.status
  });
}

async function verifyExternalIsolationBaseline(baseline) {
  const current = await captureExternalIsolationBaseline();
  if (current.publicDeploymentId !== baseline.publicDeploymentId ||
    current.protectedPreviewDeploymentId !== baseline.protectedPreviewDeploymentId) {
    throw new Error("phase7d-external-project-isolation-changed");
  }
  return current;
}

function verifyVercelDeploymentPreflight(environment, commit) {
  const links = [
    resolve(repositoryRoot, ".vercel/project.json"),
    resolve(repositoryRoot, "apps/platform-web/.vercel/project.json")
  ].filter((path) => existsSync(path));
  if (links.length === 0 || links.some((path) => {
    try { return !isPhase7dVercelLocalLink(JSON.parse(readFileSync(path, "utf8"))); }
    catch { return true; }
  })) {
    throw new Error("vercel-local-link-not-isolated-staging");
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const upstream = execFileSync("git", ["rev-parse", "@{u}"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (head !== commit || upstream !== commit || branch !== PHASE7D_BRANCH || status) {
    throw new Error("vercel-deployment-source-not-verified-clean-pushed-commit");
  }
  const project = getVercelProject(PHASE7D_VERCEL_PROJECT_NAME);
  if (project.id !== PHASE7D_VERCEL_PROJECT_ID || project.name !== PHASE7D_VERCEL_PROJECT_NAME ||
    project.accountId !== PHASE7D_VERCEL_TEAM_ID) {
    throw new Error("vercel-staging-project-or-team-mismatch");
  }
  if (!isVercelStandardProtectionScope(project.ssoProtection?.deploymentType)) {
    throw new Error("vercel-standard-protection-not-enabled");
  }
  const inventory = inspectPhase7dVercelEnvironment(
    getVercelEnvironmentEntries(), Object.keys(environment)
  );
  if (!inventory.valid) throw new Error("vercel-production-environment-inventory-mismatch");
  if (!hasNoPhase7dCustomDomains(getVercelProjectDomains())) throw new Error("vercel-staging-custom-domain-present");
  return { project, inventory };
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
  const identityAdmin = createClient(`https://${projectRef}.supabase.co`, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const identityPolicy = await identityAdmin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
  if (identityPolicy.error) throw new Error("supabase-consumer-identity-mode-preflight-failed");
  const lintOutput = supabaseCommand(["db", "lint", "--linked"]);
  const tapOutputs = [
    supabaseCommand(["test", "db", "--linked"]),
    supabaseCommand(["test", "db", "--linked"])
  ];
  const hostedStatePath = resolve(
    supabaseWorkRoot,
    "supabase/tests/phase7d-hosted-state.test.sql"
  );
  writeFileSync(hostedStatePath, buildPhase7dHostedStateVerificationSql(), "utf8");
  let hostedStateOutput;
  try {
    hostedStateOutput = supabaseCommand(["test", "db", "--linked", hostedStatePath]);
  } finally {
    rmSync(hostedStatePath, { force: true });
  }
  state.supabase = {
    action,
    projectRef,
    region: healthy.region ?? PHASE7D_SUPABASE_REGION,
    status: "ACTIVE_HEALTHY",
    migrationsFromEmpty: action === "created",
    migrationGate: /Finished supabase db push|up to date|Applied migration/i.test(migrationOutput),
    lintGate: !/error:/i.test(lintOutput),
    pgTapGate: tapOutputs.every((output) =>
      /Result: PASS|All tests successful|Files=\d+, Tests=\d+/i.test(output)
    ),
    pgTapRuns: 2,
    pgTapSummaries: tapOutputs.map((output) =>
      (output.match(/Files=\d+, Tests=\d+[^\r\n]*/i) ?? ["passed"])[0]
    ),
    hostedStateGate: /Result: PASS|All tests successful|Files=\d+, Tests=\d+/i.test(hostedStateOutput)
  };
  saveState(state);
  log(`Phase 7D Supabase ${action}; migrations, lint, two pgTAP runs, consumer identity, and fixture cleanup passed.`);
  return { publishableKey, secretKey, url: `https://${projectRef}.supabase.co` };
}

async function provisionResend(state) {
  const response = await resendJson("/domains");
  const domains = Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : [];
  const matches = domains.filter((domain) => domain.name === PHASE7D_RESEND_DOMAIN);
  if (matches.length !== 1) throw new Error(matches.length === 0 ? "resend-sender-domain-unavailable" : "duplicate-resend-sender-domain");
  const domain = matches[0];
  if (domain.status !== "verified") throw new Error("resend-sender-domain-not-verified");
  const keys = await resendJson("/api-keys");
  const stableName = "MathNexa Phase 7D staging SMTP";
  const named = (keys?.data ?? []).filter((key) => key.name === stableName);
  let runtimeApiKey = process.env.RESEND_RUNTIME_API_KEY ?? "";
  let runtimeKeyId = state.email?.runtimeKeyId ?? null;
  let runtimeAction = "reused";
  if (runtimeApiKey && runtimeKeyId) {
    if (!named.some((key) => key.id === runtimeKeyId)) throw new Error("resend-runtime-key-resource-conflict");
  } else {
    if (runtimeApiKey || runtimeKeyId || named.length > 0) throw new Error("resend-runtime-key-unrecoverable");
    const created = await resendJson("/api-keys", {
      method: "POST",
      body: JSON.stringify({
        name: stableName,
        permission: "sending_access",
        domain_id: domain.id
      })
    });
    runtimeKeyId = created?.id ?? null;
    runtimeApiKey = created?.token ?? "";
    if (!runtimeKeyId || !runtimeApiKey.startsWith("re_")) throw new Error("resend-runtime-key-creation-invalid");
    try { saveVaultSecret("RESEND_RUNTIME_API_KEY", runtimeApiKey); }
    catch (error) {
      await resendJson(`/api-keys/${encodeURIComponent(runtimeKeyId)}`, { method: "DELETE" }).catch(() => {});
      throw error;
    }
    runtimeAction = "created";
  }
  if (!resendProvisioningKeyId) throw new Error("resend-provisioning-key-identity-unavailable");
  state.email = {
    domainId: domain.id,
    domain: domain.name,
    action: "reused",
    status: "verified",
    sender: PHASE7D_RESEND_SENDER,
    provisioningKeyId: resendProvisioningKeyId,
    provisioningKeyRevoked: false,
    runtimeKeyId,
    runtimeKeyAction: runtimeAction,
    runtimePermission: "sending_access",
    runtimeDomainRestricted: true
  };
  saveState(state);
  log(`Phase 7D transactional sender domain verified; restricted SMTP runtime key ${runtimeAction}.`);
  return { runtimeApiKey };
}

async function revokeResendProvisioningKey(state) {
  const keyId = state.email?.provisioningKeyId;
  if (!keyId) throw new Error("resend-provisioning-key-identity-unavailable");
  await resendJson(`/api-keys/${encodeURIComponent(keyId)}`, { method: "DELETE" });
  removeVaultSecret("RESEND_PROVISIONING_API_KEY");
  const retired = resendProvisioningApiKey;
  resendProvisioningApiKey = null;
  for (let index = 0; index < secrets.length; index += 1) {
    if (secrets[index] === retired) secrets[index] = "[RETIRED]";
  }
  state.email.provisioningKeyRevoked = true;
  state.email.provisioningKeyId = null;
  saveState(state);
  log("Phase 7D temporary Resend Full-access provisioning key revoked and removed from the encrypted vault.");
}

async function provisionVercel(state) {
  const project = getVercelProject(PHASE7D_VERCEL_PROJECT_NAME);
  const action = "reused";
  if (project.id !== PHASE7D_VERCEL_PROJECT_ID || project.name !== PHASE7D_VERCEL_PROJECT_NAME ||
    project.accountId !== PHASE7D_VERCEL_TEAM_ID) throw new Error("vercel-staging-project-mismatch");
  if (!isVercelStandardProtectionScope(project.ssoProtection?.deploymentType)) {
    throw new Error("vercel-standard-protection-not-enabled");
  }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
  const bypassEntries = Object.keys(project.protectionBypass ?? {});
  const recovered = recoverVercelAutomationBypassSecret(project.protectionBypass);
  if (bypass.length < 24 || bypassEntries.length !== 1 || recovered !== bypass) throw new Error("vercel-bypass-resource-conflict");
  if (!secrets.includes(bypass)) secrets.push(bypass);
  state.vercel = {
    action,
    projectId: project.id,
    projectName: project.name,
    environment: "production-staging",
    standardProtection: true,
    bypassCount: 1,
    origin: PHASE7D_STAGING_ORIGIN
  };
  saveState(state);
  log(`Phase 7D Vercel project ${action}; Standard Protection is enabled.`);
  return { bypass, projectId: project.id };
}

async function provisionStripe(state) {
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
  const url = `${PHASE7D_STAGING_ORIGIN}/api/billing/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const matches = endpoints.data.filter((endpoint) =>
    endpoint.metadata?.application === "mathnexa" && endpoint.metadata?.environment === "staging" && endpoint.metadata?.phase === "7d"
  );
  if (matches.length > 1) throw new Error("duplicate-stripe-staging-webhook");
  let endpoint = matches[0] ?? null;
  let action = "reused";
  let webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (endpoint) {
    if (endpoint.livemode || endpoint.status !== "enabled") throw new Error("stripe-staging-webhook-conflict");
    if (!webhookSecret) throw new Error("stripe-staging-webhook-secret-unrecoverable");
    if (endpoint.url !== url || PHASE7D_STRIPE_EVENTS.some((event) => !new Set(endpoint.enabled_events).has(event))) {
      endpoint = await stripe.webhookEndpoints.update(endpoint.id, { url, enabled_events: PHASE7D_STRIPE_EVENTS });
      action = "updated";
    }
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

async function configureSupabaseAuth(supabase, state, resendRuntimeApiKey) {
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
      smtp_port: "587",
      smtp_user: "resend",
      smtp_pass: resendRuntimeApiKey,
      smtp_sender_name: "MathNexa",
      smtp_max_frequency: 60,
      rate_limit_email_sent: 30,
      mailer_subjects_confirmation: "Confirm your MathNexa account",
      mailer_subjects_recovery: "Reset your MathNexa password"
    })
  });
  const auth = await supabaseJson(`/v1/projects/${projectRef}/config/auth`);
  if (auth.site_url !== PHASE7D_STAGING_ORIGIN || auth.mailer_autoconfirm !== false ||
    auth.external_email_enabled !== true || auth.external_anonymous_users_enabled === true ||
    auth.smtp_host !== "smtp.resend.com" || String(auth.smtp_port) !== "587" ||
    auth.smtp_user !== "resend" || auth.smtp_admin_email !== PHASE7D_RESEND_SENDER ||
    auth.smtp_sender_name !== "MathNexa" || Number(auth.smtp_max_frequency) !== 60 ||
    Number(auth.rate_limit_email_sent) !== 30) {
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
    smtpHost: "smtp.resend.com",
    smtpPort: 587,
    smtpSecurity: "STARTTLS",
    emailRateLimitPerHour: 30,
    emailAddressMinimumIntervalSeconds: 60,
    identityModel: "consumer-v1"
  };
  saveState(state);
  log("Phase 7D Supabase Auth and custom SMTP configuration verified.");
}

function deleteRejectedVercelDeployment(id) {
  vercel(["remove", id, "--yes"]);
  if (listVercelDeployments().some((deployment) => deployment.uid === id || deployment.id === id)) {
    throw new Error("vercel-rejected-deployment-cleanup-failed");
  }
}

async function verifyStagingAccessLockAt(origin, bypass, token) {
  const anonymous = await fetch(origin, { redirect: "manual", cache: "no-store" });
  const anonymousBody = await anonymous.text();
  const anonymousLocked = anonymous.status === 404 && anonymousBody === "" &&
    anonymous.headers.get("cache-control") === "no-store" &&
    anonymous.headers.get("x-robots-tag") === "noindex, nofollow";
  if (!anonymousLocked) throw new Error("vercel-staging-application-lock-not-enforced");

  const invalid = await fetch(`${origin}/api/internal/staging-access/bootstrap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${"x".repeat(43)}`, "x-vercel-protection-bypass": bypass },
    redirect: "manual"
  });
  if (invalid.status !== 404 || await invalid.text() !== "") throw new Error("staging-bootstrap-invalid-token-accepted");

  const bootstrap = await fetch(`${origin}/api/internal/staging-access/bootstrap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-vercel-protection-bypass": bypass },
    redirect: "manual"
  });
  const cookieHeader = bootstrap.headers.get("set-cookie") ?? "";
  const cookie = cookieHeader.split(";", 1)[0];
  const validCookie = /^__Host-mvh-staging-access=v1\.[A-Za-z0-9_-]{43}$/.test(cookie) &&
    /;\s*Path=\//i.test(cookieHeader) && /;\s*HttpOnly/i.test(cookieHeader) &&
    /;\s*Secure/i.test(cookieHeader) && /;\s*SameSite=Lax/i.test(cookieHeader) &&
    !/;\s*Domain=/i.test(cookieHeader) && !cookieHeader.includes(token);
  if (bootstrap.status !== 204 || !validCookie || await bootstrap.text() !== "") {
    throw new Error("staging-bootstrap-cookie-contract-failed");
  }
  const authorized = await fetch(origin, {
    headers: { Cookie: cookie, "x-vercel-protection-bypass": bypass },
    redirect: "manual",
    cache: "no-store"
  });
  const authorizedBody = await authorized.text();
  if (authorized.status !== 200 || authorizedBody.includes(token) ||
    (authorized.headers.get("location") ?? "").includes(token)) {
    throw new Error("staging-bootstrap-authorized-access-failed");
  }
  return { anonymousLocked: true, authorizedAccess: true, cookie };
}

async function deployVercel(state, environment, bypass, commit) {
  const preflight = verifyVercelDeploymentPreflight(environment, commit);
  const before = new Set(listVercelDeployments().map((deployment) => deployment.uid ?? deployment.id));
  vercel(buildPhase7dVercelDeployArgs());
  const created = await waitFor("vercel-new-deployment", async () => {
    const matches = listVercelDeployments().filter((deployment) => !before.has(deployment.uid ?? deployment.id));
    if (matches.length > 1) throw new Error("vercel-unexpected-multiple-deployments");
    return matches[0] ?? null;
  }, Boolean);
  const deploymentId = created.uid ?? created.id;
  let metadata = await waitFor("vercel-staging-production-ready", async () => {
    const value = getVercelDeployment(deploymentId);
    if (["ERROR", "CANCELED"].includes(value.readyState ?? value.state)) {
      throw new Error("vercel-staging-deployment-not-ready");
    }
    return value;
  }, (value) => value.readyState === "READY" || value.state === "READY", 600_000);
  const targetGate = evaluatePhase7dVercelDeployment({ deployment: metadata, anonymousLocked: true });
  if (!targetGate.targetVerified) {
    deleteRejectedVercelDeployment(deploymentId);
    throw new Error(`vercel-deployment-target-not-production:${targetGate.target}`);
  }
  const sourceVerified = isPhase7dVercelDeploymentSource(metadata, commit);
  const noCustomDomains = hasNoPhase7dCustomDomains(getVercelProjectDomains());
  const environmentVerified = inspectPhase7dVercelEnvironment(
    getVercelEnvironmentEntries(), Object.keys(environment)
  ).valid;
  if (!sourceVerified || !noCustomDomains || !environmentVerified) {
    deleteRejectedVercelDeployment(deploymentId);
    throw new Error("vercel-staging-deployment-metadata-gate-failed");
  }
  const deploymentUrl = `https://${String(metadata.url ?? created.url ?? "").replace(/^https?:\/\//, "")}`;
  if (!deploymentUrl.endsWith(".vercel.app")) throw new Error("vercel-deployment-url-invalid");
  let access;
  try {
    access = await verifyStagingAccessLockAt(PHASE7D_STAGING_ORIGIN, bypass, stagingAccessToken);
  } catch (error) {
    deleteRejectedVercelDeployment(deploymentId);
    throw error;
  }
  const finalGate = evaluatePhase7dVercelDeployment({
    deployment: metadata,
    environmentVerified,
    sourceVerified,
    noCustomDomains,
    anonymousLocked: access.anonymousLocked,
    authorizedAccess: access.authorizedAccess
  });
  if (!finalGate.lifecycleAllowed) throw new Error("vercel-lifecycle-gate-not-satisfied");
  state.vercel.deploymentId = deploymentId;
  state.vercel.deploymentUrl = deploymentUrl;
  state.vercel.deploymentTarget = finalGate.target;
  state.vercel.automaticAlias = PHASE7D_STAGING_ORIGIN;
  state.vercel.productionEnvironmentCount = preflight.inventory.productionCount;
  state.vercel.previewEnvironmentCount = preflight.inventory.previewCount;
  state.vercel.noCustomDomains = true;
  state.vercel.anonymousHard404 = true;
  state.vercel.authorizedAccess = true;
  saveState(state);
  return { ...finalGate, deploymentUrl };
}

async function waitForCleanupWebhookReceipt(admin, eventType, stripeObjectId) {
  if (!admin) throw new Error("cleanup-webhook-receipt-admin-unavailable");
  await waitFor(`cleanup-${eventType}`, async () => {
    const result = await admin.from("billing_webhook_events")
      .select("processing_state")
      .eq("event_type", eventType)
      .eq("stripe_object_id", stripeObjectId)
      .maybeSingle();
    if (result.error) throw new Error("cleanup-webhook-receipt-read-failed");
    return result.data?.processing_state ?? null;
  }, (state) => ["processed", "failed", "manual_review", "ignored"].includes(state));
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
        if (subscription.status !== "canceled") {
          await stripe.subscriptions.cancel(subscriptionId);
          await waitForCleanupWebhookReceipt(admin, "customer.subscription.deleted", subscriptionId);
        }
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
        if (!("deleted" in customer && customer.deleted)) {
          await stripe.customers.del(customerId);
          await waitForCleanupWebhookReceipt(admin, "customer.deleted", customerId);
        }
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

  const isolationBaseline = await captureExternalIsolationBaseline();
  state.isolation = { ...isolationBaseline, unchanged: null };
  saveState(state);
  await validateProviderAuthentication();
  const supabase = await provisionSupabase(state);
  const resendResource = await provisionResend(state);
  const vercelResource = await provisionVercel(state);
  const stripeResource = await provisionStripe(state);
  await configureSupabaseAuth({ ...supabase, secretKey: supabase.secretKey }, state, resendResource.runtimeApiKey);
  const environment = buildPhase7dEnvironment({
    supabaseUrl: supabase.url,
    supabasePublishableKey: supabase.publishableKey,
    supabaseSecretKey: supabase.secretKey,
    supabaseProjectRef: projectRef,
    stripePublishableKey,
    stripeSecretKey,
    stripeWebhookSecret: stripeResource.webhookSecret,
    stagingAccessToken,
    buildId: commit.slice(0, 40),
    emailVerified: false
  });
  upsertVercelEnvironment(environment);
  await deployVercel(state, environment, vercelResource.bypass, commit);
  log("Phase 7D protected staging deployment is Ready; hosted lifecycle started.");

  let lifecycleError = null;
  try {
    lifecycle = await runPhase7dHostedLifecycle({
      supabaseUrl: supabase.url,
      supabaseSecretKey: supabase.secretKey,
      stripeSecretKey,
      webhookSecret: stripeResource.webhookSecret,
      bypassSecret: vercelResource.bypass,
      stagingAccessToken,
      resendApiKey: resendProvisioningApiKey
    });
    state.lifecycle = lifecycle.evidence;
    saveState(state);
  } catch (error) {
    lifecycleError = error;
    throw error;
  } finally {
    await cleanupHosted(state, lifecycleError);
  }

  await revokeResendProvisioningKey(state);

  const verifiedEmailEnvironment = buildPhase7dEnvironment({
    supabaseUrl: supabase.url,
    supabasePublishableKey: supabase.publishableKey,
    supabaseSecretKey: supabase.secretKey,
    supabaseProjectRef: projectRef,
    stripePublishableKey,
    stripeSecretKey,
    stripeWebhookSecret: stripeResource.webhookSecret,
    stagingAccessToken,
    buildId: commit.slice(0, 40),
    emailVerified: true
  });
  upsertVercelEnvironment(verifiedEmailEnvironment);
  await verifyExternalIsolationBaseline(isolationBaseline);
  state.isolation.unchanged = true;
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
    isolation: state.isolation,
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
    "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "RESEND_API_KEY", "RESEND_PROVISIONING_API_KEY",
    "RESEND_RUNTIME_API_KEY",
    "STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "VERCEL_AUTOMATION_BYPASS_SECRET",
    "MVH_STAGING_ACCESS_TOKEN"
  ]) delete process.env[name];
  rmSync(workRoot, { recursive: true, force: true });
}
