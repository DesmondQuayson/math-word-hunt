// Quiz PDFs V1 - plan, apply or verify the quiz manifest against a MathNexa
// content database.
//
//   node scripts/publish-quiz-pdfs.mjs --plan   [--target local|env]
//   node scripts/publish-quiz-pdfs.mjs --apply  [--target local|env] (--actor-email <owner email> | --actor-admin-id <uuid> | --synthetic-owner)
//   node scripts/publish-quiz-pdfs.mjs --verify [--target local|env] [--deep] [--origin http://127.0.0.1:3000] [--json]
//
// Targets: `local` reads the running local Supabase stack (`supabase status`);
// `env` reads SUPABASE_URL and SUPABASE_SECRET_KEY from the process environment
// (loaded by a launcher such as scripts/invoke-quiz-pdfs-staging.ps1). Writes to
// a hosted project need --confirm-host <host>; the production project also needs
// --production and a real owner actor (never a synthetic one). Secrets are never
// printed.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { loadQuizManifest, verifyQuizFiles } from "./quiz-pdfs/manifest.mjs";
import { applyQuizPlan, buildQuizPlan, createSyntheticOwner, describePlan, resolveActorAdmin, revokeSyntheticOwner, verifyQuizPublication } from "./quiz-pdfs/publish.mjs";

const PRODUCTION_PROJECT_REF = "ioodoktlxvvmghyvevgn";
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] ?? null : null; };
const mode = ["plan", "apply", "verify"].filter(flag);
if (mode.length !== 1) { console.error("usage: node scripts/publish-quiz-pdfs.mjs --plan|--apply|--verify [--target local|env] [...]"); process.exit(2); }
const target = option("target") ?? "local";

function localConnection() {
  const status = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  if (typeof status.API_URL !== "string" || typeof status.SECRET_KEY !== "string") throw new Error("local Supabase status is incomplete; is the local stack running?");
  return { url: status.API_URL, secretKey: status.SECRET_KEY };
}

function environmentConnection() {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (!/^https?:\/\//.test(url) || secretKey.length < 20) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for --target env");
  return { url, secretKey };
}

const connection = target === "local" ? localConnection() : environmentConnection();
const host = new URL(connection.url).hostname;
const isLocal = ["127.0.0.1", "localhost", "::1"].includes(host);
const isProduction = host.startsWith(`${PRODUCTION_PROJECT_REF}.`);
if (mode[0] === "apply" && !isLocal) {
  if (option("confirm-host") !== host) throw new Error(`refusing to write to ${host}: pass --confirm-host ${host}`);
  if (isProduction && !flag("production")) throw new Error("this is the production project: add --production and a real owner actor");
  if (isProduction && flag("synthetic-owner")) throw new Error("a synthetic owner is never created on production");
  if (flag("synthetic-owner") && !flag("allow-synthetic-owner-on-hosted")) throw new Error("--synthetic-owner on a hosted project needs --allow-synthetic-owner-on-hosted");
}
console.log(`target: ${target} (${host}${isLocal ? ", local" : isProduction ? ", PRODUCTION" : ", hosted"})`);

const manifest = loadQuizManifest();
const files = verifyQuizFiles(manifest);
if (!files.ok) {
  for (const item of files.results.filter((entry) => !entry.ok)) console.error(`FILE ${item.file}: ${item.findings.map((finding) => finding.detail).join("; ")}`);
  throw new Error("manifest files failed verification; nothing was written");
}
console.log(`manifest: ${manifest.quizzes.length} quiz PDFs across ${manifest.grades.length} grade(s), all files verified`);

const client = createClient(connection.url, connection.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

function printVerification(verification) {
  for (const item of verification.results) {
    console.log(`${item.ok ? "ok  " : "FAIL"} Grade ${item.gradeNumber} / Topic ${item.topicSortOrder ?? "?"}: ${item.topic} - ${item.title} ${item.resourceId ?? ""} ${item.problems.join(",")}`);
    if (item.detail) {
      const d = item.detail;
      console.log(`      object ${d.objectPath ?? "?"} | bucket public: ${d.bucketPublic} | ${d.downloadedBytes} bytes | sha256 ${d.downloadedSha256 ? d.downloadedSha256.slice(0, 16) : "?"}... | pages ${d.pages ?? "?"} (${d.pageMethod ?? "n/a"}, manifest ${d.manifestPages ?? "?"}) | lesson assignments ${d.lessonAssignments ?? "?"}`);
    }
  }
}

// The process ends on its own once the client's sockets drain; an explicit
// process.exit() here trips a libuv close assertion on Windows.
if (mode[0] === "plan") {
  const plan = await buildQuizPlan({ client, manifest });
  console.log(describePlan(plan));
  process.exitCode = plan.conflicts.length ? 1 : 0;
}

if (mode[0] === "apply") {
  const plan = await buildQuizPlan({ client, manifest });
  console.log(describePlan(plan));
  if (plan.conflicts.length) throw new Error("plan has conflicts; nothing was written");
  const taxonomyPublishNeeded = plan.grades.some((grade) => grade.publish || grade.topics.some((topic) => topic.publish));
  if (plan.summary.quizzesToCreate + plan.summary.quizzesToPublish + plan.summary.topicsToCreate + plan.summary.gradesToCreate === 0 && !taxonomyPublishNeeded) {
    console.log("nothing to do: every quiz is already published with the identical file");
    const verification = await verifyQuizPublication({ client, manifest });
    printVerification(verification);
    process.exitCode = verification.ok ? 0 : 1;
  } else {
    let synthetic = null;
    let actorAdminId;
    if (flag("synthetic-owner")) {
      synthetic = await createSyntheticOwner({ client, runId: randomBytes(8).toString("hex") });
      actorAdminId = synthetic.adminId;
      console.log(`synthetic owner created for this run (revoked afterwards): ${synthetic.email}`);
    } else {
      actorAdminId = await resolveActorAdmin({ client, email: option("actor-email"), adminId: option("actor-admin-id") });
      console.log(`acting as owner admin ${actorAdminId}`);
    }
    try {
      const outcome = await applyQuizPlan({ client, actorAdminId, plan });
      console.log(`done: created ${outcome.created.length}, published ${outcome.published.length}, skipped ${outcome.skipped.length}`);
    } finally {
      if (synthetic) { await revokeSyntheticOwner({ client, userId: synthetic.userId }); console.log("synthetic owner revoked"); }
    }
    const verification = await verifyQuizPublication({ client, manifest });
    printVerification(verification);
    process.exitCode = verification.ok ? 0 : 1;
  }
}

if (mode[0] === "verify") {
  // --deep also downloads every stored object from the private bucket and
  // proves bytes, sha256, PDF structure, page count, bucket privacy and the
  // absence of any lesson assignment.
  const verification = await verifyQuizPublication({ client, manifest, deep: flag("deep") });
  const origin = option("origin");
  const routes = [];
  if (origin) {
    const probe = async (path, expectation) => {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      const location = response.headers.get("location") ?? "";
      routes.push({ path, status: response.status, location, ok: expectation(response.status, location) });
    };
    await probe("/quizzes", (status, location) => status === 307 && location.endsWith("/access?next=/quizzes"));
    for (const item of verification.results.filter((entry) => entry.resourceId)) {
      await probe(`/resources/${item.resourceId}/download`, (status) => status === 401);
      await probe(`/resources/${item.resourceId}`, (status, location) => status === 307 && location.endsWith("/access?next=/quizzes"));
    }
  }
  if (flag("json")) console.log(JSON.stringify({ verification, routes }, null, 2));
  else {
    printVerification(verification);
    for (const route of routes) console.log(`${route.ok ? "ok  " : "FAIL"} anonymous ${route.path} -> ${route.status} ${route.location}`);
  }
  process.exitCode = verification.ok && routes.every((route) => route.ok) ? 0 : 1;
}
