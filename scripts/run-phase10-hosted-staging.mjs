import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import axeCore from "axe-core";
import { zipSync } from "fflate";

import {
  PHASE8_MANAGED_BUCKET_IDS,
  buildTargetedCleanupSql,
  inspectManagedBucketDefinitions,
  syntheticOwnerEmail
} from "./phase8-content-cleanup-contract.mjs";
import {
  assertMapPrepDestinationRedirect,
  assertMapPrepLaunchRedirect,
  assertMapPrepRedirectSafe
} from "./phase10-map-prep-redirect-contract.mjs";
import {
  PHASE10_MANIFEST_COMPONENTS,
  buildPhase10Manifest,
  comparePhase10Manifests,
  persistAndVerifyPhase10Manifest,
  persistPhase10Certificate,
  verifyPhase10Manifest
} from "./phase10-preservation-manifest.mjs";

const origin = "https://mathnexa-platform-staging.vercel.app";
const projectRef = "gcmuhzxkwvfireyrearl";
const productionProjectRef = "ioodoktlxvvmghyvevgn";
const projectName = "mathnexa-platform-staging";
const projectId = "prj_O61Cyx9WMjc0jljpM9erCiSXsJA0";
const scope = "bright-path-ed-tech";
const branch = "feature/admin-product-model-alignment";
const repositoryRoot = resolve(process.cwd());
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-phase10-staging-"));
const supabaseWork = join(workRoot, "supabase-work");

function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}

const accessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_/);
const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{32,}$/);
const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
const secretKey = required("SUPABASE_SECRET_KEY");
const stagingToken = required("MVH_STAGING_ACCESS_TOKEN", /^[A-Za-z0-9_-]{43}$/);
const bypassSecret = required("VERCEL_AUTOMATION_BYPASS_SECRET", /^[A-Za-z0-9_-]{20,}$/);
const vercelCli = required("PHASE10_VERCEL_CLI");
const candidateTree = required("PHASE10_CANDIDATE_TREE", /^[a-f0-9]{40}$/);
const supabaseUrl = `https://${projectRef}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const secrets = [accessToken, databasePassword, publishableKey, secretKey, stagingToken, bypassSecret];

const trackedTables = [
  "admin_users", "admin_sessions", "admin_mfa_challenges", "admin_audit_log",
  "content_grades", "content_topics", "content_lessons", "content_resources", "content_resource_versions",
  "lesson_resource_assignments", "topic_resource_assignments", "resource_files", "resource_download_events",
  "game_catalog_entries", "game_catalog_entry_versions", "game_catalog_destination_audit", "game_external_allowed_hosts", "game_packages",
  "game_package_assets", "game_package_quarantine_events", "game_launch_events", "cms_documents",
  "cms_document_versions", "cms_media_assets", "cms_media_versions", "cms_media_usage",
  "consumer_accounts", "consumer_game_entitlements", "consumer_commercial_acceptances",
  "consumer_checkout_acceptance_bindings", "platform_feature_flags", "platform_feature_flag_history",
  "platform_analytics_events"
];

function check(value, code) { if (!value) throw new Error(code); }
function redact(value) { let safe = String(value ?? ""); for (const secret of secrets) safe = safe.replaceAll(secret, "[REDACTED]"); return safe; }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot, encoding: "utf8", env: options.env ?? process.env,
    stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"], input: options.input
  });
  if (result.status !== 0) throw new Error(`command-failed:${redact(`${result.stdout}\n${result.stderr}`).slice(-4000)}`);
  return result.stdout.trim();
}
function supabase(args) {
  return run(process.execPath, [supabaseCli, ...args, "--workdir", supabaseWork, "--yes"], {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken, SUPABASE_DB_PASSWORD: databasePassword, SUPABASE_TELEMETRY_DISABLED: "true" }
  });
}
function vercel(args, input) { return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", vercelCli, ...args], { input }); }
function rows(value) { return Array.isArray(value) ? value : value?.result ?? value?.data ?? []; }
async function managementQuery(query) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ query, password: databasePassword })
    });
    const responseText = await response.text();
    if (response.ok) {
      try { return responseText ? JSON.parse(responseText) : null; } catch { return responseText; }
    }
    if (response.status !== 429 || attempt === 5) {
      throw new Error(`management-query-failed-${response.status}:${redact(responseText).slice(-1500)}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : Math.min(1000 * (2 ** attempt), 16_000);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw new Error("management-query-retry-exhausted");
}
function sqlIdentifier(value) {
  check(/^[a-z_][a-z0-9_]*$/.test(value), "manifest-sql-identifier-invalid");
  return `"${value}"`;
}
async function captureTableSnapshots(qualifiedNames) {
  const requestedValues=qualifiedNames.map((qualifiedName,index)=>{const[schema,table]=qualifiedName.split(".");sqlIdentifier(schema);sqlIdentifier(table);return `(${sqlLiteral(schema)},${sqlLiteral(table)},${index})`}).join(",");
  const metadata=rows(await managementQuery(`with requested(schema_name,table_name,position) as (values ${requestedValues})
select requested.schema_name,requested.table_name,requested.position,
  to_regclass(format('%I.%I',requested.schema_name,requested.table_name)) is not null as present,
  coalesce(array_agg(attribute.attname order by key.position) filter(where attribute.attname is not null),array[]::text[]) as primary_key
from requested
left join pg_class relation on relation.oid=to_regclass(format('%I.%I',requested.schema_name,requested.table_name))
left join pg_index index_row on index_row.indrelid=relation.oid and index_row.indisprimary
left join lateral unnest(index_row.indkey) with ordinality as key(attnum,position) on true
left join pg_attribute attribute on attribute.attrelid=relation.oid and attribute.attnum=key.attnum
group by requested.schema_name,requested.table_name,requested.position
order by requested.position;`));
  check(metadata.length===qualifiedNames.length,"manifest-table-metadata-incomplete");
  const present=metadata.filter((entry)=>entry.present===true);
  const rowQueries=present.map((entry)=>{
    const primaryKey=Array.isArray(entry.primary_key)?entry.primary_key:[];
    const orderBy=primaryKey.length?primaryKey.map((column)=>`t.${sqlIdentifier(column)}`).join(","):"to_jsonb(t)::text";
    return `select ${sqlLiteral(entry.schema_name)} as schema_name,${sqlLiteral(entry.table_name)} as table_name,coalesce(jsonb_agg(to_jsonb(t) order by ${orderBy}),'[]'::jsonb) as table_rows from ${sqlIdentifier(entry.schema_name)}.${sqlIdentifier(entry.table_name)} t`;
  });
  const captured=rowQueries.length?rows(await managementQuery(rowQueries.join(" union all "))):[];
  const capturedByName=new Map(captured.map((entry)=>[`${entry.schema_name}.${entry.table_name}`,entry.table_rows??[]]));
  return metadata.map((entry)=>{
    const qualifiedName=`${entry.schema_name}.${entry.table_name}`;
    const tableRows=entry.present===true?(capturedByName.get(qualifiedName)??[]):[];
    check(Array.isArray(tableRows),`manifest-table-rows-invalid:${qualifiedName}`);
    return {schema:entry.schema_name,table:entry.table_name,present:entry.present===true,primaryKey:Array.isArray(entry.primary_key)?entry.primary_key:[],rowCount:tableRows.length,rows:tableRows};
  });
}
async function databaseCaptureTimestamp() {
  const raw = rows(await managementQuery("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US') as captured_at;"))[0]?.captured_at;
  const value = typeof raw === "string" ? `${raw.replace(" ", "T")}Z` : "";
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value ?? ""), "manifest-capture-timestamp-invalid");
  return value;
}
async function captureDurableManifest(kind) {
  const qualifiedTables = [...new Set(Object.values(PHASE10_MANIFEST_COMPONENTS).flat())];
  const tableSnapshots = await captureTableSnapshots(qualifiedTables);
  const bucketDefinitions = rows(await managementQuery("select to_jsonb(t) as row from storage.buckets t order by id;")).map((entry) => entry.row);
  const storageObjects = rows(await managementQuery("select to_jsonb(t)-'metadata'-'user_metadata' as row from storage.objects t order by bucket_id,name,id;")).map((entry) => entry.row);
  const manifest = buildPhase10Manifest({
    projectRef, productionProjectRef, candidateTree, gitHead: run("git", ["rev-parse", "HEAD"]),
    syntheticRunId: fixture.runId, capturedAt: await databaseCaptureTimestamp(), tableSnapshots,
    bucketDefinitions, storageObjects
  });
  const path = resolve(repositoryRoot, "qa-artifacts", "phase10", fixture.runId, `${kind}-manifest.json`);
  return { path, manifest: persistAndVerifyPhase10Manifest(path, manifest) };
}
async function syntheticResidueSummary() {
  const result = rows(await managementQuery(`select jsonb_build_object(
    'auth_users',(select count(*) from auth.users where raw_user_meta_data ? 'synthetic_run_id' or lower(coalesce(email,'')) like 'phase%@example.invalid'),
    'mfa_factors',(select count(*) from auth.mfa_factors factor join auth.users usr on usr.id=factor.user_id where usr.raw_user_meta_data ? 'synthetic_run_id'),
    'admin_identities',(select count(*) from public.admin_users admin join auth.users usr on usr.id=admin.user_id where usr.raw_user_meta_data ? 'synthetic_run_id'),
    'admin_sessions',(select count(*) from public.admin_sessions session join public.admin_users admin on admin.id=session.admin_user_id join auth.users usr on usr.id=admin.user_id where usr.raw_user_meta_data ? 'synthetic_run_id'),
    'game_catalog',(select count(*) from public.game_catalog_entries where stable_key like 'phase%'),
    'destination_audit',(select count(*) from public.game_catalog_destination_audit audit join public.game_catalog_entries entry on entry.id=audit.catalog_entry_id where entry.stable_key like 'phase%'),
    'package_versions',(select count(*) from public.game_packages where game_id like 'phase%'),
    'homework',(select count(*) from public.lesson_resource_assignments assignment join public.content_resources resource on resource.id=assignment.resource_id where resource.resource_type in ('homework_pdf','homework_answer_key') and assignment.slug like 'phase%'),
    'quizzes',((select count(*) from public.topic_resource_assignments assignment join public.content_resources resource on resource.id=assignment.resource_id where resource.resource_type in ('quiz_pdf','quiz_answer_key') and assignment.slug like 'phase%')+(select count(*) from public.lesson_resource_assignments assignment join public.content_resources resource on resource.id=assignment.resource_id where resource.resource_type in ('quiz_pdf','quiz_answer_key') and assignment.slug like 'phase%')),
    'taxonomy',((select count(*) from public.content_grades where slug like 'phase%')+(select count(*) from public.content_topics where slug like 'phase%')+(select count(*) from public.content_lessons where slug like 'phase%')),
    'map_cms_media_analytics',((select count(*) from public.cms_document_versions where content::text ilike '%synthetic%')+(select count(*) from public.cms_media_assets where media_key like 'phase%')+(select count(*) from public.platform_analytics_events where coalesce(topic_slug,'') like 'phase%' or coalesce(lesson_slug,'') like 'phase%')),
    'audit_evidence',(select count(*) from public.admin_audit_log where metadata::text ilike '%synthetic_run_id%' or metadata::text ilike '%phase 10 isolated staging%')
  ) as residue;`))[0]?.residue;
  check(result && Object.keys(result).length === 12, "staging-residue-summary-unavailable");
  for (const [name, count] of Object.entries(result)) check(Number(count) === 0, `staging-residue-${name}-not-zero`);
  return Object.fromEntries(Object.entries(result).sort().map(([name, count]) => [name, { row_count: Number(count), component_hash: "d751713988987e9331980363e24189ce" }]));
}
function parseJsonOutput(value) {
  const objectStart=value.indexOf("{"),arrayStart=value.indexOf("[");
  const start=objectStart<0?arrayStart:arrayStart<0?objectStart:Math.min(objectStart,arrayStart);
  const end=value.lastIndexOf(value[start]==="["?"]":"}");check(start>=0&&end>start,"provider-json-missing");
  return JSON.parse(value.slice(start,end+1));
}
function upsertEnvironment(key,value){vercel(["api",`/v10/projects/${projectId}/env?upsert=true`,"--scope",scope,"--method","POST","--input","-","--silent"],JSON.stringify({key,value,type:"sensitive",target:["production"]}))}
function findReadyCandidateDeployment(){const listing=parseJsonOutput(vercel(["list",projectName,"--scope",scope,"--json"]));const deployments=Array.isArray(listing)?listing:listing.deployments??[];const match=deployments.find((item)=>item.state==="READY"&&item.target==="production"&&item.meta?.candidateTree===candidateTree);if(!match?.url)return null;const inspected=parseJsonOutput(vercel(["inspect",match.url,"--scope",scope,"--json"]));return{id:inspected.id??inspected.uid,url:match.url,readyState:inspected.readyState}}
async function waitFor(label,read,accept,timeout=180000){const deadline=Date.now()+timeout;let latest;while(Date.now()<deadline){latest=await read();if(await accept(latest))return latest;await new Promise((done)=>setTimeout(done,1000))}throw new Error(`${label}-timed-out`)}

async function preservationFingerprint(){const result=await managementQuery(`select md5(jsonb_build_object(
  'auth_users',(select coalesce(jsonb_agg(to_jsonb(t)-'encrypted_password'-'confirmation_token'-'recovery_token'-'email_change_token_new'-'email_change' order by id),'[]'::jsonb) from auth.users t),
  'mfa',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from auth.mfa_factors t),
  'admins',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.admin_users t),
  'customers',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_customers t),
  'subscriptions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_subscriptions t),
  'entitlements',(select coalesce(jsonb_agg(to_jsonb(t) order by user_id),'[]'::jsonb) from public.consumer_game_entitlements t),
  'acceptances',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.consumer_commercial_acceptances t),
  'bindings',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.consumer_checkout_acceptance_bindings t),
  'grades',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.content_grades t),
  'topics',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.content_topics t),
  'lessons',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.content_lessons t),
  'resources',(select coalesce(jsonb_agg(to_jsonb(t)-'resource_scope'-'scope_status' order by id),'[]'::jsonb) from public.content_resources t)
)::text) as fingerprint;`);const value=rows(result)[0]?.fingerprint;check(/^[a-f0-9]{32}$/.test(value??""),"preservation-fingerprint-unavailable");return value}
async function tableCounts(){const values={};for(const table of trackedTables){const result=await admin.from(table).select("*",{count:"exact",head:true});if(result.error)throw new Error(`count-${table}-failed`);values[table]=result.count??-1}return values}
async function authCount(){const result=await admin.auth.admin.listUsers({page:1,perPage:1000});if(result.error)throw new Error("auth-inventory-failed");return result.data.users.length}
async function mfaCount(){const result=await managementQuery("select count(*)::integer as count from auth.mfa_factors;");const count=Number(rows(result)[0]?.count);check(Number.isSafeInteger(count),"mfa-inventory-failed");return count}
async function listBucketObjects(bucket,prefix=""){const found=[];let offset=0;while(true){const result=await admin.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:"name",order:"asc"}});if(result.error)throw new Error(`list-${bucket}-failed`);for(const item of result.data){const path=prefix?`${prefix}/${item.name}`:item.name;if(item.id)found.push(path);else found.push(...await listBucketObjects(bucket,path))}if(result.data.length<100)break;offset+=100}return found}
async function bucketState(){const listed=await admin.storage.listBuckets({limit:100,offset:0});if(listed.error)throw new Error("bucket-inventory-failed");const objectCounts={};for(const bucket of PHASE8_MANAGED_BUCKET_IDS)objectCounts[bucket]=(await listBucketObjects(bucket)).length;const inspection=inspectManagedBucketDefinitions(listed.data,objectCounts);check(inspection.validDefinitions,"bucket-definition-drift");return{objectCounts,inspection}}
async function inventory(){return{authUsers:await authCount(),mfaFactors:await mfaCount(),counts:await tableCounts(),buckets:await bucketState()}}
async function commercialWriteCounts(){const result={};for(const table of["billing_customers","billing_subscriptions","consumer_commercial_acceptances","consumer_checkout_acceptance_bindings"]){const count=await admin.from(table).select("id",{count:"exact",head:true});if(count.error)throw new Error(`map-prep-commercial-count-${table}`);result[table]=count.count??-1}return result}
function assertInventory(before,after,label){check(before.authUsers===after.authUsers,`${label}-auth-count`);check(before.mfaFactors===after.mfaFactors,`${label}-mfa-count`);for(const[table,count]of Object.entries(before.counts))check(after.counts[table]===count,`${label}-${table}-count`);check(before.buckets.inspection.fingerprint===after.buckets.inspection.fingerprint,`${label}-bucket-definition`);for(const[bucket,count]of Object.entries(before.buckets.objectCounts))check(after.buckets.objectCounts[bucket]===count,`${label}-${bucket}-objects`)}

function decodeBase32(value){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";for(const character of value.replaceAll("=","").toUpperCase())bits+=alphabet.indexOf(character).toString(2).padStart(5,"0");const bytes=[];for(let offset=0;offset+8<=bits.length;offset+=8)bytes.push(Number.parseInt(bits.slice(offset,offset+8),2));return Buffer.from(bytes)}
async function currentTotp(secret){const remainder=30-(Math.floor(Date.now()/1000)%30);if(remainder<4)await new Promise((done)=>setTimeout(done,(remainder+1)*1000));const payload=Buffer.alloc(8);payload.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=createHmac("sha1",decodeBase32(secret)).update(payload).digest();const offset=digest.at(-1)&15;return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0")}
async function bootstrap(context){const response=await context.request.post(`${origin}/api/internal/staging-access/bootstrap`,{headers:{Authorization:`Bearer ${stagingToken}`,"x-vercel-protection-bypass":bypassSecret}});check(response.status()===204,"staging-bootstrap-failed")}
async function ownerLogin(page,email,password,secret=null){await page.goto(`${origin}/admin/sign-in`);await page.getByLabel("Owner email address").fill(email);await page.getByLabel("Password").fill(password);await page.getByRole("button",{name:"Continue securely"}).click();if(!secret){await page.getByRole("button",{name:"Set up authenticator"}).click();secret=(await page.locator("code.admin-setup-secret").textContent())?.trim()??"";check(secret.length>10,"mfa-secret-missing")}await page.getByLabel("Six-digit authenticator code").fill(await currentTotp(secret));await page.getByRole("button",{name:"Verify and open admin"}).click();await page.waitForURL(`${origin}/admin`);return secret}

const bytes=(value)=>Uint8Array.from(Buffer.from(value));const sha=(value)=>createHash("sha256").update(value).digest("hex");const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+T0m02QAAAABJRU5ErkJggg==","base64");
function gameArchive(runId,version="1.0.0",unsafe=false){const suffix=runId.slice(0,12);const gameId=unsafe?`phase10-unsafe-${suffix}`:`phase10-game-${suffix}`;const assets={"game/index.html":bytes('<!doctype html><html><head><link rel="stylesheet" href="styles.css"><script src="main.js" defer></script></head><body><main><h1>Phase 10 Fraction Field</h1><button id="answer">Show answer</button><output id="result"></output></main></body></html>'),"game/main.js":bytes(unsafe?'eval("blocked")':'document.querySelector("#answer").addEventListener("click",()=>{document.querySelector("#result").textContent="Synthetic check passed"})'),"game/styles.css":bytes("body{font-family:system-ui;color:#102a43}button{min-height:44px}"),"thumbnail.png":Uint8Array.from(png),"metadata.json":bytes(JSON.stringify({fixture:"phase10-hosted-staging",synthetic_run_id:runId}))};const manifest={package_schema_version:"1.0",game_id:gameId,version,title:unsafe?"Unsafe Phase 10 Game":"Phase 10 Fraction Field",description:"Isolated Phase 10 staging package.",entry_file:"game/index.html",thumbnail:"thumbnail.png",asset_inventory:Object.keys(assets),integrity_hashes:Object.fromEntries(Object.entries(assets).map(([path,value])=>[path,sha(value)])),minimum_mathnexa_runtime_version:"1.0.0"};return Buffer.from(zipSync({"manifest.json":bytes(JSON.stringify(manifest)),...assets},{level:6}))}
const safePdf=(title)=>Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Catalog /AcroForm 2 0 R >> endobj\n2 0 obj << /Fields [] /Title (${title}) >> endobj\n%%EOF`);
function article(page,title){return page.locator("article").filter({has:page.getByRole("heading",{name:title,exact:true})})}
async function publishTaxonomyNode(name,idKey,id,title,slug,order){let lock=1;for(const state of["validating","ready_for_review","published"]){const result=await admin.rpc(name,{p_actor_admin_id:fixture.adminId,[idKey]:id,p_expected_lock_version:lock,p_title:title,p_slug:slug,p_sort_order:order,p_publication_state:state});if(result.error)throw result.error;lock=Number(result.data)}}
async function publishResource(page,title){let row=page.locator(".admin-resource-table tbody tr").filter({has:page.getByText(title,{exact:true})});for(const label of["Validate","Mark ready for review","Publish"]){await row.getByRole("button",{name:label,exact:true}).click();await page.waitForURL(/publish=/);row=page.locator(".admin-resource-table tbody tr").filter({has:page.getByText(title,{exact:true})})}}
async function fillGameMetadata(form,{title,slug,order}){await form.getByLabel("Title",{exact:true}).fill(title);await form.getByLabel("Slug",{exact:true}).fill(slug);await form.getByLabel("Description").fill("Isolated owner-reviewed Phase 10 staging game.");await form.getByLabel("Recommended grade minimum").fill("4");await form.getByLabel("Recommended grade maximum").fill("7");await form.getByLabel("Difficulty").selectOption("core");await form.getByLabel("Display order").fill(String(order));await form.getByLabel("Skills").fill("fractions, fluency");await form.getByLabel("Topics").fill("number-sense");await form.getByLabel("Tags").fill("synthetic, phase10")}

const cleanupRunId=process.env.PHASE10_CLEANUP_RUN_ID?.trim()??"";
const repairRunId=process.env.PHASE10_REPAIR_MANIFEST_RUN_ID?.trim()??"";
if(cleanupRunId&&!/^[a-f0-9]{32}$/.test(cleanupRunId))throw new Error("invalid-phase10-cleanup-run-id");
if(repairRunId&&!/^[a-f0-9]{32}$/.test(repairRunId))throw new Error("invalid-phase10-repair-run-id");
if(cleanupRunId&&repairRunId)throw new Error("phase10-run-mode-conflict");
const fixture={runId:cleanupRunId||repairRunId||randomUUID().replaceAll("-",""),startedAt:new Date().toISOString(),ownerUserId:null,ordinaryUserId:null,adminId:null,entityTargets:new Set(),auditRows:new Map(),catalogRows:[],destinationAuditRows:[],analyticsRows:[],analyticsBaselineIds:new Set(),mapLaunchRequested:false,mapAnalyticsExpected:false,frozenAt:null};
function addTargets(...values){for(const value of values.flat()){const target=String(value??"");if(target.length>0&&target.length<=160)fixture.entityTargets.add(target)}}
async function collectTargets(){if(!fixture.adminId)return;for(const[table,column]of[["content_grades","id"],["content_topics","id"],["content_lessons","id"],["content_resources","id"],["game_packages","id"],["game_package_quarantine_events","id"],["cms_documents","id"],["cms_media_assets","id"]]){const result=await admin.from(table).select(column).eq("created_by",fixture.adminId);if(result.error)throw new Error(`target-${table}-failed`);addTargets(result.data.map((row)=>row[column]))}const sessions=await admin.from("admin_sessions").select("id").eq("admin_user_id",fixture.adminId);if(sessions.error)throw sessions.error;addTargets(sessions.data.map((row)=>row.id));const audits=await admin.from("admin_audit_log").select("target").eq("admin_user_id",fixture.adminId).like("action","admin.game.%");if(audits.error)throw audits.error;addTargets(audits.data.map((row)=>row.target))}
async function collectCatalogCleanupScope(){
  if(!fixture.adminId){fixture.catalogRows=[];fixture.destinationAuditRows=[];return}
  const resources=await admin.from("content_resources").select("id").eq("created_by",fixture.adminId);
  const packages=await admin.from("game_packages").select("id,resource_id").eq("created_by",fixture.adminId);
  if(resources.error||packages.error)throw new Error("cleanup-game-dependencies-unavailable");
  const resourceIds=new Set(resources.data.map((row)=>row.id));
  const packageRows=new Map(packages.data.map((row)=>[row.id,row]));
  const entries=[];
  if(resourceIds.size){const hosted=await admin.from("game_catalog_entries").select("id,stable_key,launch_type,package_id,resource_id,created_at").in("resource_id",[...resourceIds]);if(hosted.error)throw new Error("cleanup-hosted-catalog-unavailable");entries.push(...hosted.data)}
  const externalStableKey=`phase10-https-${fixture.runId.slice(0,8)}`;
  const external=await admin.from("game_catalog_entries").select("id,stable_key,launch_type,package_id,resource_id,created_at").eq("stable_key",externalStableKey).limit(2);
  if(external.error)throw new Error("cleanup-external-catalog-unavailable");entries.push(...external.data);
  const unique=[...new Map(entries.map((row)=>[row.id,row])).values()];
  for(const row of unique){
    const hosted=row.launch_type==="hosted_package"&&resourceIds.has(row.resource_id)&&packageRows.has(row.package_id)&&packageRows.get(row.package_id).resource_id===row.resource_id;
    const exactExternal=row.launch_type==="external_https"&&row.stable_key===externalStableKey&&row.package_id===null&&row.resource_id===null;
    check(hosted||exactExternal,"cleanup-catalog-ownership-ambiguous");
  }
  fixture.catalogRows=unique.map((row)=>({id:row.id,stableKey:row.stable_key,launchType:row.launch_type,packageId:row.package_id,resourceId:row.resource_id,createdAt:row.created_at})).sort((left,right)=>left.id.localeCompare(right.id));
  addTargets(fixture.catalogRows.map((row)=>row.id));
  if(!unique.length){fixture.destinationAuditRows=[];return}
  const destination=await admin.from("game_catalog_destination_audit").select("id,catalog_entry_id,recorded_at").in("catalog_entry_id",unique.map((row)=>row.id)).order("recorded_at");
  if(destination.error)throw new Error("cleanup-destination-audit-unavailable");
  for(const row of unique)check(destination.data.some((audit)=>audit.catalog_entry_id===row.id),"cleanup-destination-audit-missing");
  fixture.destinationAuditRows=destination.data.map((row)=>({id:row.id,catalogEntryId:row.catalog_entry_id,recordedAt:row.recorded_at}));
}
async function captureAudits(){const result=await admin.from("admin_audit_log").select("id,admin_user_id,target,created_at").gte("created_at",fixture.startedAt).lte("created_at",fixture.frozenAt??new Date().toISOString()).order("created_at");if(result.error)throw result.error;for(const row of result.data){const actor=row.admin_user_id===fixture.adminId,target=typeof row.target==="string"&&fixture.entityTargets.has(row.target);if(actor||target)fixture.auditRows.set(row.id,{id:row.id,target:row.target,actorBound:actor})}}
async function mapAnalyticsRows(){const result=await admin.from("platform_analytics_events").select("id,metric_key,occurred_at,grade_number,topic_slug,lesson_slug,outcome,quantity,source").eq("metric_key","map-prep-launch").gte("occurred_at",fixture.startedAt).lte("occurred_at",fixture.frozenAt??new Date().toISOString()).order("occurred_at");if(result.error)throw new Error("map-analytics-inventory-unavailable");return result.data}
async function collectAnalyticsCleanupScope(){
  if(!fixture.mapLaunchRequested){fixture.analyticsRows=[];return}
  const created=(await mapAnalyticsRows()).filter((row)=>!fixture.analyticsBaselineIds.has(row.id));
  check(created.length<=1,"map-analytics-created-row-ambiguous");
  if(!created.length){check(!fixture.mapAnalyticsExpected,"map-analytics-created-row-missing");fixture.analyticsRows=[];return}
  const row=created[0];
  check(row.metric_key==="map-prep-launch"&&row.grade_number===null&&row.topic_slug===null&&row.lesson_slug===null&&row.outcome==="success"&&row.quantity===1&&row.source==="runtime","map-analytics-created-row-invalid");
  const occurredAt=new Date(row.occurred_at);
  check(Number.isFinite(occurredAt.valueOf())&&occurredAt>=new Date(fixture.startedAt)&&occurredAt<=new Date(fixture.frozenAt??new Date().toISOString()),"map-analytics-created-row-window");
  fixture.mapAnalyticsExpected=true;
  fixture.analyticsRows=[{id:row.id,runId:fixture.runId,metricKey:row.metric_key,occurredAt:row.occurred_at,gradeNumber:row.grade_number,topicSlug:row.topic_slug,lessonSlug:row.lesson_slug,outcome:row.outcome,quantity:row.quantity,source:row.source}];
  addTargets(row.id);
}
async function collectObjectPaths(){const result=new Map(PHASE8_MANAGED_BUCKET_IDS.map((id)=>[id,new Set()]));if(!fixture.adminId)return result;const resources=await admin.from("content_resources").select("id").eq("created_by",fixture.adminId);if(resources.error)throw resources.error;const ids=resources.data.map((row)=>row.id);if(ids.length){const files=await admin.from("resource_files").select("bucket_id,object_path").in("resource_id",ids);if(files.error)throw files.error;for(const file of files.data)result.get(file.bucket_id)?.add(file.object_path)}const packages=await admin.from("game_packages").select("id").eq("created_by",fixture.adminId);if(packages.error)throw packages.error;const packageIds=packages.data.map((row)=>row.id);if(packageIds.length){const assets=await admin.from("game_package_assets").select("object_path").in("package_id",packageIds);if(assets.error)throw assets.error;for(const asset of assets.data)result.get("game-packages").add(asset.object_path)}const quarantine=await admin.from("game_package_quarantine_events").select("object_path").eq("created_by",fixture.adminId);if(quarantine.error)throw quarantine.error;for(const row of quarantine.data)if(row.object_path)result.get("game-package-quarantine").add(row.object_path);return result}
async function removeObjects(paths){for(const[bucket,set]of paths){const items=[...set];for(let offset=0;offset<items.length;offset+=100){const removed=await admin.storage.from(bucket).remove(items.slice(offset,offset+100));if(removed.error)throw removed.error}}}
function sqlLiteral(value){return `'${String(value).replaceAll("'","''")}'`}
async function restoreFeatureFlag(baseline){await managementQuery(`update public.platform_feature_flags set enabled=${baseline.enabled},message=${baseline.message===null?"null":sqlLiteral(baseline.message)},version=${Number(baseline.version)},updated_by=${baseline.updated_by?`${sqlLiteral(baseline.updated_by)}::uuid`:"null"},updated_at=${sqlLiteral(baseline.updated_at)}::timestamptz where flag_key='admin-emergency-disabled';`)}
async function deleteUser(id){if(!id)return;const result=await admin.auth.admin.deleteUser(id);if(result.error&&!/not found/i.test(result.error.message))throw result.error}
function cleanupScope(){return{projectRef,runId:fixture.runId,startedAt:fixture.startedAt,frozenAt:fixture.frozenAt,auditRows:[...fixture.auditRows.values()].sort((left,right)=>left.id.localeCompare(right.id)),catalogRows:fixture.catalogRows,destinationAuditRows:fixture.destinationAuditRows,analyticsRows:fixture.analyticsRows,requireAnalyticsCleanup:fixture.mapAnalyticsExpected}}

async function allAuthUsers(){const users=[];for(let page=1;;page+=1){const result=await admin.auth.admin.listUsers({page,perPage:1000});if(result.error)throw new Error("cleanup-auth-inventory-failed");users.push(...result.data.users);if(result.data.users.length<1000)break}return users}
async function allRows(table){const result=[];for(let from=0;;from+=1000){const page=await admin.from(table).select("*").range(from,from+999);if(page.error)throw new Error(`cleanup-fingerprint-${table}-failed`);result.push(...page.data);if(page.data.length<1000)break}return result}
function rowContainsAny(row,tokens){const value=JSON.stringify(row);return tokens.some((token)=>token&&value.includes(token))}
async function unrelatedRunFingerprint(){
  const tokens=[fixture.runId,fixture.ownerUserId,fixture.ordinaryUserId,fixture.adminId,syntheticOwnerEmail(fixture.runId),`phase10-ordinary-${fixture.runId}@example.invalid`,...fixture.entityTargets,...fixture.catalogRows.map((row)=>row.id),...fixture.destinationAuditRows.map((row)=>row.id),...fixture.analyticsRows.map((row)=>row.id)].filter(Boolean);
  const snapshot={};
  for(const table of trackedTables){const values=(await allRows(table)).filter((row)=>!rowContainsAny(row,tokens)).map((row)=>JSON.stringify(row)).sort();snapshot[table]=values}
  snapshot.auth=(await allAuthUsers()).filter((user)=>!tokens.includes(user.id)&&user.user_metadata?.synthetic_run_id!==fixture.runId).map((user)=>JSON.stringify({id:user.id,email:user.email,created_at:user.created_at,updated_at:user.updated_at,user_metadata:user.user_metadata,app_metadata:user.app_metadata})).sort();
  const mfa=await managementQuery(`select coalesce(md5(jsonb_agg(to_jsonb(factor) order by factor.id)::text),md5('[]')) as fingerprint from auth.mfa_factors factor where factor.user_id not in (${sqlLiteral(fixture.ownerUserId)}::uuid,${sqlLiteral(fixture.ordinaryUserId)}::uuid);`);
  snapshot.mfa=rows(mfa)[0]?.fingerprint??"";
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
async function exactResidueCounts(){
  const exactTokens=[fixture.runId,fixture.ownerUserId,fixture.ordinaryUserId,fixture.adminId,...fixture.entityTargets,...fixture.catalogRows.map((row)=>row.id),...fixture.destinationAuditRows.map((row)=>row.id),...fixture.analyticsRows.map((row)=>row.id)].filter(Boolean);
  const values={};for(const table of trackedTables)values[table]=(await allRows(table)).filter((row)=>rowContainsAny(row,exactTokens)).length;
  const users=(await allAuthUsers()).filter((user)=>user.user_metadata?.synthetic_run_id===fixture.runId);
  const mfa=await managementQuery(`select count(*)::integer as count from auth.mfa_factors where user_id in (${sqlLiteral(fixture.ownerUserId)}::uuid,${sqlLiteral(fixture.ordinaryUserId)}::uuid);`);
  const buckets=await bucketState();
  return{
    authUsers:users.length,mfaFactors:Number(rows(mfa)[0]?.count??-1),
    adminIdentitiesSessions:(values.admin_users??0)+(values.admin_sessions??0)+(values.admin_mfa_challenges??0),
    gameCatalogEntries:values.game_catalog_entries??0,destinationAuditRows:values.game_catalog_destination_audit??0,
    gamePackagesAndVersions:(values.game_packages??0)+(values.game_package_assets??0)+(values.game_catalog_entry_versions??0),
    homeworkQuizRows:(values.content_resources??0)+(values.content_resource_versions??0)+(values.lesson_resource_assignments??0)+(values.topic_resource_assignments??0)+(values.resource_files??0),
    taxonomyRows:(values.content_grades??0)+(values.content_topics??0)+(values.content_lessons??0),
    cmsMediaAnalytics:(values.cms_documents??0)+(values.cms_document_versions??0)+(values.cms_media_assets??0)+(values.cms_media_versions??0)+(values.cms_media_usage??0)+(values.game_launch_events??0),
    syntheticAnalyticsEvents:values.platform_analytics_events??0,
    managedStorageObjects:Object.values(buckets.objectCounts).reduce((sum,count)=>sum+count,0),
    quarantineObjects:(buckets.objectCounts["resource-quarantine"]??0)+(buckets.objectCounts["game-package-quarantine"]??0)+(buckets.objectCounts["cms-media-quarantine"]??0),
    unknownBuckets:buckets.inspection.unknown.length,privateBucketDefinitions:buckets.inspection.infrastructureBucketRows
  };
}
function assertResidueZero(value){for(const[key,count]of Object.entries(value)){if(key==="privateBucketDefinitions")check(count===7,"cleanup-private-bucket-definition-count");else check(count===0,`cleanup-residue-${key}`)}}
function manifestTable(manifest,qualifiedName){const[schema,table]=qualifiedName.split(".");return manifest.components.flatMap((component)=>component.tables).find((entry)=>entry.schema===schema&&entry.table===table)}
function componentHashesMatch(before,after){const comparison=comparePhase10Manifests(before,after);check(comparison.components.length===12&&comparison.components.every((component)=>component.identical),"phase10-repair-component-mismatch");check(comparison.storage_identical,"phase10-repair-storage-mismatch");return comparison}
async function repairStagingBaseline(){
  check(projectRef!==productionProjectRef,"phase10-repair-production-collision");
  const artifactRoot=resolve(repositoryRoot,"qa-artifacts","phase10",fixture.runId);
  const pre=verifyPhase10Manifest(JSON.parse(readFileSync(resolve(artifactRoot,"pre-run-manifest.json"),"utf8")));
  const post=verifyPhase10Manifest(JSON.parse(readFileSync(resolve(artifactRoot,"post-cleanup-manifest.json"),"utf8")));
  check(pre.staging_project_ref===projectRef&&post.staging_project_ref===projectRef,"phase10-repair-manifest-project-mismatch");
  check(pre.synthetic_run_id===fixture.runId&&post.synthetic_run_id===fixture.runId,"phase10-repair-manifest-run-mismatch");
  const prePolicy=manifestTable(pre,"private.platform_identity_policy")?.rows?.[0];
  const postPolicy=manifestTable(post,"private.platform_identity_policy")?.rows?.[0];
  check(prePolicy?.identity_model==="consumer-v1"&&postPolicy?.identity_model==="consumer-v1"&&prePolicy.updated_at!==postPolicy.updated_at,"phase10-repair-policy-evidence-invalid");
  const preAnalytics=manifestTable(pre,"public.platform_analytics_events")?.rows??[];
  const postAnalytics=manifestTable(post,"public.platform_analytics_events")?.rows??[];
  const baselineAnalyticsIds=new Set(preAnalytics.map((row)=>row.id));
  const added=postAnalytics.filter((row)=>!baselineAnalyticsIds.has(row.id));
  check(added.length===1,"phase10-repair-analytics-evidence-ambiguous");
  const event=added[0];
  check(event.metric_key==="map-prep-launch"&&event.grade_number===null&&event.topic_slug===null&&event.lesson_slug===null&&event.outcome==="success"&&event.quantity===1&&event.source==="runtime","phase10-repair-analytics-evidence-invalid");
  const currentPolicy=rows(await managementQuery("select identity_model,to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as updated_at from private.platform_identity_policy where singleton;"))[0];
  const policyAtPre=currentPolicy?.identity_model===prePolicy.identity_model&&currentPolicy.updated_at===prePolicy.updated_at;
  const policyAtPost=currentPolicy?.identity_model===postPolicy.identity_model&&currentPolicy.updated_at===postPolicy.updated_at;
  check(policyAtPre||policyAtPost,"phase10-repair-policy-current-state-ambiguous");
  const candidates=rows(await managementQuery(`select id::text,metric_key,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as occurred_at,grade_number,topic_slug,lesson_slug,outcome,quantity,source from public.platform_analytics_events where occurred_at=${sqlLiteral(event.occurred_at)}::timestamptz and metric_key='map-prep-launch';`));
  const exactCandidates=candidates.filter((row)=>`sha256:${createHash("sha256").update(row.id).digest("hex")}`===event.id);
  check(exactCandidates.length<=1,"phase10-repair-analytics-current-state-ambiguous");
  if(exactCandidates.length){const current=exactCandidates[0];check(current.occurred_at===event.occurred_at&&current.grade_number===null&&current.topic_slug===null&&current.lesson_slug===null&&current.outcome==="success"&&Number(current.quantity)===1&&current.source==="runtime","phase10-repair-analytics-current-row-mismatch")}
  const eventId=exactCandidates[0]?.id??null;
  const repairSql=`begin;
lock table private.platform_identity_policy, public.platform_analytics_events in share row exclusive mode;
do $$ begin
  if not exists(select 1 from private.platform_identity_policy where singleton and identity_model=${sqlLiteral(prePolicy.identity_model)} and updated_at in (${sqlLiteral(prePolicy.updated_at)}::timestamptz,${sqlLiteral(postPolicy.updated_at)}::timestamptz)) then
    raise exception 'phase10_repair_identity_policy_state_mismatch';
  end if;
end $$;
update private.platform_identity_policy set updated_at=${sqlLiteral(prePolicy.updated_at)}::timestamptz
  where singleton and identity_model=${sqlLiteral(postPolicy.identity_model)} and updated_at=${sqlLiteral(postPolicy.updated_at)}::timestamptz;
${eventId?`delete from public.platform_analytics_events where id=${sqlLiteral(eventId)}::uuid and metric_key='map-prep-launch' and occurred_at=${sqlLiteral(event.occurred_at)}::timestamptz and grade_number is null and topic_slug is null and lesson_slug is null and outcome='success' and quantity=1 and source='runtime';`:"-- The exact synthetic aggregate event is already absent."}
commit;`;
  await managementQuery(repairSql);
  const repairPostPath=resolve(artifactRoot,"repair-post-manifest.json");
  const repaired=existsSync(repairPostPath)?{path:repairPostPath,manifest:verifyPhase10Manifest(JSON.parse(readFileSync(repairPostPath,"utf8")))}:await captureDurableManifest("repair-post");
  const comparison=componentHashesMatch(pre,repaired.manifest);
  await managementQuery(repairSql);
  const idempotencyPath=resolve(artifactRoot,"repair-idempotency-manifest.json");
  const repeated=existsSync(idempotencyPath)?{path:idempotencyPath,manifest:verifyPhase10Manifest(JSON.parse(readFileSync(idempotencyPath,"utf8")))}:await captureDurableManifest("repair-idempotency");
  const repeatedComparison=componentHashesMatch(repaired.manifest,repeated.manifest);
  const certificatePath=resolve(artifactRoot,"repair-certificate.json");
  const certificate=existsSync(certificatePath)?JSON.parse(readFileSync(certificatePath,"utf8")):persistPhase10Certificate(certificatePath,{
    certificate_version:"phase10-targeted-repair-v1",staging_project_ref:projectRef,synthetic_run_id:fixture.runId,
    repaired_from_manifest_checksum:post.checksum,restored_to_manifest_checksum:pre.checksum,
    repair_manifest_checksum:repaired.manifest.checksum,idempotency_manifest_checksum:repeated.manifest.checksum,
    identity_policy_restored:policyAtPost,analytics_event_deleted:eventId!==null,
    component_comparison:comparison.components,storage_identical:comparison.storage_identical,
    idempotency_component_comparison:repeatedComparison.components,idempotency_storage_identical:repeatedComparison.storage_identical,
    second_run_identity_policy_writes:0,second_run_analytics_deletions:0
  });
  check(certificate.staging_project_ref===projectRef&&certificate.synthetic_run_id===fixture.runId&&certificate.repair_manifest_checksum===repaired.manifest.checksum&&certificate.idempotency_manifest_checksum===repeated.manifest.checksum,"phase10-repair-certificate-mismatch");
  rmSync(workRoot,{recursive:true,force:true});
  process.stdout.write(`${JSON.stringify({passed:true,mode:"targeted-manifest-repair",runId:fixture.runId,allTwelveComponentsRestored:comparison.components.every((component)=>component.identical),storageRestored:comparison.storage_identical,idempotent:repeatedComparison.components.every((component)=>component.identical)&&repeatedComparison.storage_identical,certificate},null,2)}\n`);
}
async function recoverFailedRun(){
  const users=(await allAuthUsers()).filter((user)=>user.user_metadata?.synthetic_run_id===fixture.runId);
  const ownerEmail=syntheticOwnerEmail(fixture.runId),ordinaryEmail=`phase10-ordinary-${fixture.runId}@example.invalid`;
  check(users.length===2&&users.every((user)=>[ownerEmail,ordinaryEmail].includes(user.email?.toLowerCase())),"cleanup-auth-run-ambiguous");
  fixture.ownerUserId=users.find((user)=>user.email?.toLowerCase()===ownerEmail)?.id??null;
  fixture.ordinaryUserId=users.find((user)=>user.email?.toLowerCase()===ordinaryEmail)?.id??null;
  const adminRow=await admin.from("admin_users").select("id").eq("user_id",fixture.ownerUserId).limit(2);
  check(!adminRow.error&&adminRow.data.length===1,"cleanup-admin-run-ambiguous");fixture.adminId=adminRow.data[0].id;
  fixture.startedAt=new Date(Math.min(...users.map((user)=>new Date(user.created_at).valueOf()))).toISOString();
  addTargets(fixture.ownerUserId,fixture.ordinaryUserId,fixture.adminId,ownerEmail,ordinaryEmail);
  await collectTargets();await collectCatalogCleanupScope();
  check(fixture.catalogRows.length>0&&fixture.destinationAuditRows.length>0,"cleanup-game-allowlist-empty");
  const actorAudits=await admin.from("admin_audit_log").select("created_at").eq("admin_user_id",fixture.adminId).gte("created_at",fixture.startedAt).order("created_at",{ascending:false}).limit(1);
  if(actorAudits.error)throw new Error("cleanup-audit-window-unavailable");
  const timestamps=[fixture.startedAt,...actorAudits.data.map((row)=>row.created_at),...fixture.catalogRows.map((row)=>row.createdAt),...fixture.destinationAuditRows.map((row)=>row.recordedAt)].map((value)=>new Date(value).valueOf());
  fixture.frozenAt=new Date(Math.max(...timestamps)+1).toISOString();
  check(new Date(fixture.frozenAt)-new Date(fixture.startedAt)<=3600000,"cleanup-run-window-unbounded");
  await captureAudits();check(fixture.auditRows.size>0,"cleanup-audit-allowlist-empty");
  const unrelatedBefore=await unrelatedRunFingerprint();
  const paths=await collectObjectPaths();await removeObjects(paths);
  const cleanupSql=buildTargetedCleanupSql(fixture.runId,cleanupScope());
  await managementQuery(cleanupSql);await deleteUser(fixture.ordinaryUserId);await deleteUser(fixture.ownerUserId);
  const first=await exactResidueCounts();assertResidueZero(first);check(await unrelatedRunFingerprint()===unrelatedBefore,"cleanup-unrelated-fingerprint-changed");
  await managementQuery(cleanupSql);await deleteUser(fixture.ordinaryUserId);await deleteUser(fixture.ownerUserId);
  const second=await exactResidueCounts();assertResidueZero(second);check(JSON.stringify(first)===JSON.stringify(second),"cleanup-not-idempotent");check(await unrelatedRunFingerprint()===unrelatedBefore,"cleanup-idempotent-fingerprint-changed");
  rmSync(workRoot,{recursive:true,force:true});
  process.stdout.write(`${JSON.stringify({passed:true,mode:"exact-residue-cleanup",runId:fixture.runId,catalogAllowlist:fixture.catalogRows.length,destinationAuditAllowlist:fixture.destinationAuditRows.length,cleanupToZero:second,cleanupIdempotent:true,unrelatedFingerprintUnchanged:true},null,2)}\n`);
}

async function main(){const evidence={};let deploymentId=null,primaryError=null,cleanupError=null;let baseline=null,baselineFingerprint=null,flagBaseline=null,preCapture=null,postCapture=null,idempotentCapture=null,preservationCertificate=null,preResidue=null,finalResidue=null;const ownerEmail=syntheticOwnerEmail(fixture.runId),ordinaryEmail=`phase10-ordinary-${fixture.runId}@example.invalid`,password=`Mx10-Staging!${fixture.runId.slice(0,12)}`;try{
  cpSync(resolve("supabase"),join(supabaseWork,"supabase"),{recursive:true});supabase(["link","--project-ref",projectRef]);
  check(projectRef!==productionProjectRef,"phase10-staging-production-collision");
  baseline=await inventory();check(baseline.authUsers===0,"staging-baseline-auth-not-zero");check(baseline.mfaFactors===0,"staging-baseline-mfa-not-zero");check(baseline.buckets.inspection.cleanupToZero,"staging-managed-buckets-not-zero");check(baseline.buckets.inspection.infrastructureBucketRows===7,"staging-private-bucket-count");check(baseline.buckets.inspection.unknown.length===0,"staging-unknown-bucket");
  preResidue=await syntheticResidueSummary();preCapture=await captureDurableManifest("pre-run");evidence.preRunManifestChecksum=preCapture.manifest.checksum;evidence.preRunManifestReadBack=true;evidence.preRunResidue=preResidue;
  const beforeMigration=await preservationFingerprint();supabase(["db","push","--linked","--include-all"]);const afterMigration=await preservationFingerprint();check(beforeMigration===afterMigration,"staging-migration-preservation-failed");evidence.migrationFingerprint=beforeMigration;
  supabase(["test","db","--linked"]);supabase(["test","db","--linked"]);evidence.remotePgTapRuns=2;
  const identityBefore=rows(await managementQuery("select identity_model,to_char(updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US') as updated_at from private.platform_identity_policy where singleton;"))[0];check(identityBefore?.identity_model==="consumer-v1"&&identityBefore.updated_at,"identity-policy-baseline-invalid");
  const identity=await admin.rpc("ensure_platform_identity_model",{p_expected_current:"consumer-v1",p_identity_model:"consumer-v1"});if(identity.error)throw identity.error;check(identity.data===false,"identity-policy-setup-wrote-row");
  const identityAfter=rows(await managementQuery("select identity_model,to_char(updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US') as updated_at from private.platform_identity_policy where singleton;"))[0];check(identityAfter?.identity_model===identityBefore.identity_model&&identityAfter.updated_at===identityBefore.updated_at,"identity-policy-noop-mutated-state");evidence.identityPolicyNoOp=true;
  const postMigrationBaseline=await inventory();assertInventory(baseline,postMigrationBaseline,"staging-migration");baselineFingerprint=await preservationFingerprint();
  flagBaseline=(await admin.from("platform_feature_flags").select("enabled,message,version,updated_by,updated_at").eq("flag_key","admin-emergency-disabled").single()).data;check(flagBaseline,"admin-emergency-baseline-missing");
  upsertEnvironment("MVH_BUILD_ID",candidateTree);let deployment=findReadyCandidateDeployment();if(!deployment){vercel(["deploy",".","--project",projectName,"--scope",scope,"--prod","--yes","--json","--meta",`candidateTree=${candidateTree}`,"--meta",`gitCommitRef=${branch}`]);deployment=findReadyCandidateDeployment()}check(deployment?.id&&deployment.readyState==="READY","staging-deployment-not-ready");deploymentId=deployment.id;
  await waitFor("staging-origin",()=>fetch(origin,{redirect:"manual",headers:{"x-vercel-protection-bypass":bypassSecret}}),(response)=>response.status===404&&response.headers.get("cache-control")?.includes("no-store"),300000);evidence.deployment=true;

  const owner=await admin.auth.admin.createUser({email:ownerEmail,password,email_confirm:true,user_metadata:{synthetic_run_id:fixture.runId}});const ordinary=await admin.auth.admin.createUser({email:ordinaryEmail,password,email_confirm:true,user_metadata:{synthetic_run_id:fixture.runId}});if(owner.error||ordinary.error||!owner.data.user||!ordinary.data.user)throw new Error("synthetic-users-create-failed");fixture.ownerUserId=owner.data.user.id;fixture.ordinaryUserId=ordinary.data.user.id;addTargets(ownerEmail,ordinaryEmail,fixture.ownerUserId,fixture.ordinaryUserId);
  const adminRow=await admin.from("admin_users").insert({user_id:fixture.ownerUserId,role:"owner",mfa_enrolled:false}).select("id").single();if(adminRow.error)throw adminRow.error;fixture.adminId=adminRow.data.id;addTargets(fixture.adminId);
  const entitlement=await admin.from("consumer_game_entitlements").insert({user_id:fixture.ownerUserId,capability_key:"MATHNEXA_ALL_ACCESS",entitlement_state:"subscription-active",current_period_ends_at:new Date(Date.now()+86400000).toISOString()});if(entitlement.error)throw entitlement.error;

  const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:"reduce",extraHTTPHeaders:{"x-vercel-protection-bypass":bypassSecret}});await bootstrap(context);const page=await context.newPage();let mfaSecret="";try{
    await page.goto(`${origin}/sign-in`);await page.getByLabel("Email address").fill(ordinaryEmail);await page.getByLabel("Password").fill(password);await page.getByRole("button",{name:"Sign in"}).click();await page.waitForURL(/\/(?:account|teacher)$/);const switchResponse=await page.goto(`${origin}/admin/sign-in`);check(switchResponse?.status()===200,"ordinary-admin-sign-in-not-200");await page.getByRole("heading",{name:"Sign in to MathNexa Admin"}).waitFor();await page.getByText("You are currently signed in to MathNexa without Admin access. Sign out of this account to continue with the authorized owner account.").waitFor();check((await context.request.get(`${origin}/admin`,{maxRedirects:0})).status()===404,"ordinary-admin-not-hidden");await page.getByRole("button",{name:"Sign out and continue"}).click();await page.waitForURL(/\/admin\/sign-in\?switched=1$/);evidence.accountSwitch=true;
    mfaSecret=await ownerLogin(page,ownerEmail,password);check((await context.request.get(`${origin}/admin`,{maxRedirects:0})).status()===200,"owner-admin-missing");evidence.ownerMfa=true;

    await page.goto(`${origin}/admin?section=homework`);const gradeForm=page.locator("form.admin-taxonomy-step").filter({has:page.getByRole("heading",{name:"1. Add Grade"})});await gradeForm.getByLabel("Grade number (1-9)").fill("4");await gradeForm.getByLabel("Display title").fill("Phase 10 Grade 4");await gradeForm.getByLabel("Slug").fill(`phase10-grade-4-${fixture.runId.slice(0,8)}`);await gradeForm.getByLabel("Display order").fill("4");await gradeForm.getByRole("button",{name:"Create grade"}).click();await page.waitForURL(/taxonomy=created/);
    const gradeSlug=`phase10-grade-4-${fixture.runId.slice(0,8)}`;const grade=(await admin.from("content_grades").select("id").eq("slug",gradeSlug).single()).data;check(grade,"grade-create-missing");
    let topicForm=page.locator("form.admin-taxonomy-step").filter({has:page.getByRole("heading",{name:"2. Add Topic"})});await topicForm.getByLabel("Topic title").fill("Fractions");await topicForm.getByLabel("Topic slug").fill(`phase10-fractions-${fixture.runId.slice(0,8)}`);await topicForm.getByLabel("Topic number / order").fill("1");await topicForm.getByRole("button",{name:"Create topic"}).click();await page.waitForURL(/taxonomy=created/);
    const topicSlug=`phase10-fractions-${fixture.runId.slice(0,8)}`;const topic=(await admin.from("content_topics").select("id").eq("slug",topicSlug).single()).data;check(topic,"topic-create-missing");
    const lessonForm=page.locator("form.admin-taxonomy-step").filter({has:page.getByRole("heading",{name:"3. Add Lesson"})});await lessonForm.getByLabel("Lesson title").fill("Equivalent fractions");await lessonForm.getByLabel("Lesson slug").fill(`phase10-equivalent-fractions-${fixture.runId.slice(0,8)}`);await lessonForm.getByLabel("Lesson number / order").fill("1");await lessonForm.getByRole("button",{name:"Create lesson"}).click();await page.waitForURL(/taxonomy=created/);
    const lessonSlug=`phase10-equivalent-fractions-${fixture.runId.slice(0,8)}`;const lesson=(await admin.from("content_lessons").select("id").eq("slug",lessonSlug).single()).data;check(lesson,"lesson-create-missing");addTargets(grade.id,topic.id,lesson.id);
    await publishTaxonomyNode("update_content_grade","p_grade_id",grade.id,"Phase 10 Grade 4",gradeSlug,4);await publishTaxonomyNode("update_content_topic","p_topic_id",topic.id,"Fractions",topicSlug,1);await publishTaxonomyNode("update_content_lesson","p_lesson_id",lesson.id,"Equivalent fractions",lessonSlug,1);evidence.taxonomy=true;

    await page.goto(`${origin}/admin?section=homework`);const homework=page.locator("#add-homework");await homework.getByLabel("Grade for Homework").selectOption(grade.id);await homework.getByLabel("Topic for Homework").selectOption(topic.id);await homework.locator("select[name=lessonId]").selectOption(lesson.id);await homework.getByLabel("Title",{exact:true}).fill("Phase 10 fraction Homework");await homework.getByLabel("Slug",{exact:true}).fill(`phase10-fraction-homework-${fixture.runId.slice(0,8)}`);await homework.getByLabel("Description").fill("Synthetic isolated staging Homework.");await homework.getByLabel("Tags").fill("fractions, phase10");await homework.getByLabel("Homework PDF").setInputFiles({name:"phase10-homework.pdf",mimeType:"application/pdf",buffer:safePdf("Homework")});await homework.getByLabel("Homework Answer Key PDF").setInputFiles({name:"phase10-homework-answer.pdf",mimeType:"application/pdf",buffer:safePdf("Answer Key")});await homework.getByRole("button",{name:"Save draft"}).click();await page.waitForURL(/\/admin\/resources\/[0-9a-f-]+\?kind=homework&result=saved$/);const homeworkId=/resources\/([0-9a-f-]+)/.exec(page.url())?.[1];check(homeworkId,"homework-id-missing");addTargets(homeworkId);await page.reload();await page.getByRole("heading",{name:"Phase 10 fraction Homework"}).waitFor();await page.getByLabel("Description").fill("Reopened and revised synthetic Homework.");await page.getByRole("button",{name:"Save new draft version"}).click();await page.waitForURL(new RegExp(`/admin/resources/${homeworkId}\\?kind=homework&result=revised$`));await page.getByRole("link",{name:"Back to Homework"}).click();await publishResource(page,"Phase 10 fraction Homework");check((await admin.from("content_resources").select("id",{count:"exact",head:true}).eq("id",homeworkId)).count===1,"homework-duplicated");evidence.homeworkDraft=true;

    await page.goto(`${origin}/admin?section=quizzes`);const quiz=page.locator("#add-quizzes");await quiz.getByLabel("Grade for Quiz").selectOption(grade.id);await quiz.getByLabel("Topic for Quiz").selectOption(topic.id);check(await quiz.locator('select[name="lessonId"]').count()===0,"quiz-lesson-present");await quiz.getByLabel("Slug",{exact:true}).fill(`phase10-fractions-quiz-${fixture.runId.slice(0,8)}`);await quiz.getByLabel("Description").fill("Synthetic topic-level Quiz.");await quiz.getByLabel("Quiz PDF").setInputFiles({name:"phase10-quiz.pdf",mimeType:"application/pdf",buffer:safePdf("Quiz")});await quiz.getByLabel("Quiz Answer Key PDF").setInputFiles({name:"phase10-quiz-answer.pdf",mimeType:"application/pdf",buffer:safePdf("Quiz Answer")});await quiz.getByRole("button",{name:"Save draft"}).click();await page.waitForURL(/kind=quizzes&result=saved/);const quizId=/resources\/([0-9a-f-]+)/.exec(page.url())?.[1];check(quizId,"quiz-id-missing");addTargets(quizId);await page.getByRole("link",{name:"Back to Quizzes"}).click();await publishResource(page,"Topic 1 Quiz: Fractions");const quizScope=await admin.from("content_resources").select("resource_scope,scope_status").eq("id",quizId).single();check(!quizScope.error&&quizScope.data.resource_scope==="topic"&&quizScope.data.scope_status==="current","quiz-scope-invalid");evidence.topicQuiz=true;

    await page.goto(`${origin}/admin?section=games`);let gameForm=page.locator("#add-games form");const gameSlug=`phase10-game-${fixture.runId.slice(0,12)}`;await fillGameMetadata(gameForm,{title:"Phase 10 Fraction Field",slug:gameSlug,order:40});await gameForm.getByLabel("MathNexa ZIP package").setInputFiles({name:"phase10-game-v1.zip",mimeType:"application/zip",buffer:gameArchive(fixture.runId,"1.0.0")});await gameForm.getByRole("button",{name:"Upload and validate package"}).click();await page.waitForURL(/package=saved/);let gameCard=article(page,"Phase 10 Fraction Field");for(const label of["Validate package","Mark ready for review","Publish game"]){await gameCard.getByRole("button",{name:label,exact:true}).click();await page.waitForURL(/package=updated/);gameCard=article(page,"Phase 10 Fraction Field")}
    await page.goto(`${origin}/admin?section=games`);gameForm=page.locator("#add-games form");await fillGameMetadata(gameForm,{title:"Phase 10 Fraction Field",slug:gameSlug,order:40});await gameForm.getByLabel("MathNexa ZIP package").setInputFiles({name:"phase10-game-v2.zip",mimeType:"application/zip",buffer:gameArchive(fixture.runId,"1.1.0")});await gameForm.getByRole("button",{name:"Upload and validate package"}).click();await page.waitForURL(/package=saved/);gameCard=page.locator("article").filter({hasText:"1.1.0"});for(const label of["Validate package","Mark ready for review","Publish game"]){await gameCard.getByRole("button",{name:label,exact:true}).click();await page.waitForURL(/package=updated/);gameCard=page.locator("article").filter({hasText:"1.1.0"})}gameCard=article(page,"Phase 10 Fraction Field");await gameCard.getByText("Edit and version history",{exact:true}).click();await gameCard.getByRole("button",{name:"Restore this package"}).click();await page.waitForURL(/package=rolled-back/);const packageRow=await admin.from("game_packages").select("id,resource_id").eq("game_id",gameSlug).eq("package_version","1.0.0").order("created_at",{ascending:false}).limit(1).single();if(packageRow.error)throw packageRow.error;addTargets(packageRow.data.id,packageRow.data.resource_id);
    await page.goto(`${origin}/admin?section=games`);gameForm=page.locator("#add-games form");await fillGameMetadata(gameForm,{title:"Unsafe Phase 10 Game",slug:`phase10-unsafe-${fixture.runId.slice(0,12)}`,order:41});await gameForm.getByLabel("MathNexa ZIP package").setInputFiles({name:"phase10-unsafe.zip",mimeType:"application/zip",buffer:gameArchive(fixture.runId,"1.0.0",true)});await gameForm.getByRole("button",{name:"Upload and validate package"}).click();await page.waitForURL(/package=quarantined/);evidence.hostedGame=true;evidence.zipQuarantine=true;

    await page.goto(`${origin}/admin?section=games`);await page.locator("#add-games .admin-launch-choice select").selectOption("external_https");const external=page.locator("#add-games form");const externalSlug=`phase10-https-${fixture.runId.slice(0,8)}`;await fillGameMetadata(external,{title:"Phase 10 HTTPS Game",slug:externalSlug,order:42});await external.getByLabel("HTTPS destination").fill("https://example.com/");await external.getByLabel("Allowed host").fill("example.com");await external.getByRole("button",{name:"Validate and save draft"}).click();await page.waitForURL(/package=external-saved/);let externalCard=article(page,"Phase 10 HTTPS Game");await externalCard.getByRole("button",{name:"Publish game",exact:true}).click();await page.waitForURL(/package=published/);externalCard=article(page,"Phase 10 HTTPS Game");await externalCard.getByText("Edit and version history",{exact:true}).click();await externalCard.getByLabel("Display title").fill("Phase 10 HTTPS Game revised");await externalCard.getByRole("button",{name:"Save new version"}).click();await page.waitForURL(/package=catalog-updated/);externalCard=article(page,"Phase 10 HTTPS Game revised");await externalCard.getByText("Edit and version history",{exact:true}).click();await externalCard.getByRole("button",{name:"Restore this version"}).first().click();await page.waitForURL(/package=rolled-back/);const externalRow=await admin.from("game_catalog_entries").select("id").eq("stable_key",externalSlug).single();if(externalRow.error)throw externalRow.error;addTargets(externalRow.data.id);evidence.httpsGame=true;evidence.gameRollback=true;

    await page.goto(`${origin}/admin/map-prep`);const mapForm=page.locator("#map-prep-editor form"),mapDestination="https://example.com/";await mapForm.locator('[name="label"]').fill("Phase 10 MAP Prep");await mapForm.locator('[name="publicDescription"]').fill("Synthetic verified MAP Prep staging destination.");await mapForm.locator('[name="destinationUrl"]').fill(mapDestination);await mapForm.locator('[name="allowedHost"]').fill("example.com");await mapForm.locator('[name="openMode"]').selectOption("new_tab");await mapForm.locator('[name="enabled"]').check();await mapForm.getByRole("button",{name:"Test destination and save draft"}).click();await page.waitForURL(/map=draft-saved/);await page.getByRole("button",{name:"Mark ready for review"}).click();await page.waitForURL(/map=ready_for_review/);await page.getByRole("button",{name:"Publish verified destination"}).click();await page.waitForURL(/map=published/);const commercialBeforeMap=await commercialWriteCounts();fixture.analyticsBaselineIds=new Set((await mapAnalyticsRows()).map((row)=>row.id));fixture.mapLaunchRequested=true;const mapEntry=await context.request.get(`${origin}/map-prep`,{maxRedirects:0});const mapEntryBody=await mapEntry.text();const launchUrl=assertMapPrepLaunchRedirect({status:mapEntry.status(),location:mapEntry.headers().location,origin});assertMapPrepRedirectSafe({values:[mapEntryBody,launchUrl],secrets});const mapLaunch=await context.request.get(launchUrl,{maxRedirects:0});const mapLaunchBody=await mapLaunch.text();const externalUrl=assertMapPrepDestinationRedirect({status:mapLaunch.status(),location:mapLaunch.headers().location,origin,expectedDestination:mapDestination});assertMapPrepRedirectSafe({values:[mapLaunchBody,externalUrl],secrets});fixture.mapAnalyticsExpected=true;await collectAnalyticsCleanupScope();check(JSON.stringify(await commercialWriteCounts())===JSON.stringify(commercialBeforeMap),"map-prep-commercial-mutation");evidence.mapPrep=true;evidence.mapPrepRedirect=true;evidence.exactMapAnalyticsCaptured=true;

    await page.goto(`${origin}/admin?section=games`);await page.addScriptTag({content:axeCore.source});const axe=await page.evaluate(async()=>globalThis.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa"]}}));check(axe.violations.filter((item)=>["critical","serious"].includes(item.impact)).length===0,"staging-accessibility-violations");for(const size of[{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){await page.setViewportSize(size);check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`responsive-overflow-${size.width}`)}await page.emulateMedia({reducedMotion:"reduce",forcedColors:"active"});await page.getByRole("navigation",{name:"Admin modules"}).waitFor();evidence.accessibilityResponsive=true;
    const html=await page.locator("html").innerHTML();check(secrets.every((secret)=>!html.includes(secret)),"hosted-secret-exposure");const csrf=await page.locator('input[name="csrfToken"]').first().inputValue();const denied=await context.request.post(`${origin}/admin/games/external`,{maxRedirects:0,headers:{Origin:origin},form:{csrfToken:csrf,title:"Unsafe URL",slug:`unsafe-url-${fixture.runId.slice(0,8)}`,description:"Must fail closed.",recommendedGradeMin:"",recommendedGradeMax:"",difficulty:"core",displayOrder:"80",skills:"",topics:"",tags:"",externalUrl:"javascript:alert(1)",allowedHost:"example.com",thumbnailReference:"builtin:game-card"}});check(denied.status()===303&&/invalid-input|unsafe-destination/.test(denied.headers().location??""),"unsafe-url-not-denied");evidence.security=true;

    const session=await admin.from("admin_sessions").select("id").eq("admin_user_id",fixture.adminId).is("ended_at",null).single();if(session.error)throw session.error;const flag=await admin.rpc("set_platform_feature_flag",{p_admin_user_id:fixture.adminId,p_admin_session_id:session.data.id,p_flag_key:"admin-emergency-disabled",p_enabled:true,p_message:null,p_reason:"Phase 10 isolated staging emergency verification",p_expected_version:flagBaseline.version});if(flag.error)throw flag.error;await waitFor("admin-emergency-sign-in-hide",()=>context.request.get(`${origin}/admin/sign-in`,{maxRedirects:0}),(response)=>response.status()===404,30000);await waitFor("admin-emergency-admin-hide",()=>context.request.get(`${origin}/admin`,{maxRedirects:0}),(response)=>response.status()===404,30000);await restoreFeatureFlag(flagBaseline);await waitFor("admin-emergency-restore",()=>context.request.get(`${origin}/admin/sign-in`,{maxRedirects:0}),(response)=>response.status()===200,30000);evidence.emergencyDisable=true;
    await context.clearCookies();await bootstrap(context);await ownerLogin(page,ownerEmail,password,mfaSecret);const replayCookie=(await context.cookies()).find((cookie)=>cookie.name==="mvh-admin-session");await page.getByRole("button",{name:"End admin session"}).click();await page.waitForURL(/\/admin\/sign-in\?signedOut=1$/);check((await context.request.get(`${origin}/admin/sign-in`,{maxRedirects:0})).status()===200,"ended-session-sign-in-broken");if(replayCookie){await context.addCookies([replayCookie]);check((await context.request.get(`${origin}/admin`,{maxRedirects:0})).status()===404,"ended-session-replayed")}evidence.endSession=true;
  }finally{await context.close().catch(()=>{});await browser.close().catch(()=>{})}
  await collectTargets();await collectCatalogCleanupScope();fixture.frozenAt=new Date().toISOString();await collectAnalyticsCleanupScope();await captureAudits();check(fixture.auditRows.size>0,"cleanup-audit-scope-empty");
}catch(error){primaryError=error}finally{try{
  if(flagBaseline)await restoreFeatureFlag(flagBaseline);await collectTargets();await collectCatalogCleanupScope();fixture.frozenAt??=new Date().toISOString();await collectAnalyticsCleanupScope();await captureAudits();
  let cleanupSql=null;
  if(fixture.adminId&&fixture.auditRows.size){const paths=await collectObjectPaths();await removeObjects(paths);cleanupSql=buildTargetedCleanupSql(fixture.runId,cleanupScope());await managementQuery(cleanupSql);await deleteUser(fixture.ordinaryUserId);await deleteUser(fixture.ownerUserId)}else{await deleteUser(fixture.ordinaryUserId);await deleteUser(fixture.ownerUserId)}
  if(baseline&&preCapture){
    const after=await inventory();assertInventory(baseline,after,"staging-cleanup");check(await preservationFingerprint()===baselineFingerprint,"staging-cleanup-fingerprint");finalResidue=await syntheticResidueSummary();postCapture=await captureDurableManifest("post-cleanup");const comparison=comparePhase10Manifests(preCapture.manifest,postCapture.manifest);check(comparison.identical,"staging-preservation-certificate-mismatch");
    if(cleanupSql)await managementQuery(cleanupSql);await deleteUser(fixture.ordinaryUserId);await deleteUser(fixture.ownerUserId);
    const idempotentInventory=await inventory();assertInventory(after,idempotentInventory,"staging-idempotent-cleanup");const idempotentResidue=await syntheticResidueSummary();idempotentCapture=await captureDurableManifest("post-idempotency");const idempotentComparison=comparePhase10Manifests(postCapture.manifest,idempotentCapture.manifest);check(idempotentComparison.identical&&postCapture.manifest.checksum===idempotentCapture.manifest.checksum,"staging-idempotent-manifest-mismatch");check(JSON.stringify(finalResidue)===JSON.stringify(idempotentResidue),"staging-idempotent-residue-mismatch");
    const exactCounts=await exactResidueCounts();assertResidueZero(exactCounts);
    const certificate={certificate_version:"phase10-preservation-certificate-v1",staging_project_ref:projectRef,synthetic_run_id:fixture.runId,candidate_tree:candidateTree,git_head:run("git",["rev-parse","HEAD"]),verified_at:await databaseCaptureTimestamp(),pre_run_manifest_checksum:preCapture.manifest.checksum,post_cleanup_manifest_checksum:postCapture.manifest.checksum,post_idempotency_manifest_checksum:idempotentCapture.manifest.checksum,component_comparison:comparison.components,storage_identical:comparison.storage_identical,exact_zero_counts:exactCounts,synthetic_component_counts:finalResidue,audit_immutability:comparison.components.find((component)=>component.name==="operations_audit")?.identical===true,bucket_verification:{private_bucket_definitions:after.buckets.inspection.infrastructureBucketRows,managed_storage_objects:Object.values(after.buckets.objectCounts).reduce((sum,count)=>sum+count,0),quarantine_objects:(after.buckets.objectCounts["resource-quarantine"]??0)+(after.buckets.objectCounts["game-package-quarantine"]??0)+(after.buckets.objectCounts["cms-media-quarantine"]??0),unknown_buckets:after.buckets.inspection.unknown.length},cleanup_idempotent:true,second_cleanup_deletions:0,second_cleanup_restorations:0};
    const certificatePath=resolve(repositoryRoot,"qa-artifacts","phase10",fixture.runId,"preservation-certificate.json");preservationCertificate=persistPhase10Certificate(certificatePath,certificate);evidence.cleanupToZero=true;evidence.cleanupIdempotent=true;evidence.preservationCertificate=true;evidence.postCleanupManifestChecksum=postCapture.manifest.checksum;evidence.componentComparison=comparison.components;evidence.exactCleanupCounts=exactCounts;evidence.auditImmutability=preservationCertificate.audit_immutability;evidence.bucketVerification=preservationCertificate.bucket_verification;
  }
}catch(error){cleanupError=error}rmSync(workRoot,{recursive:true,force:true})}
if(cleanupError)throw new Error(`cleanup-to-zero-failed:${cleanupError.message}`);if(primaryError)throw primaryError;process.stdout.write(`${JSON.stringify({passed:true,candidateTree,deploymentId,syntheticRunId:fixture.runId,preRunManifestChecksum:preCapture?.manifest.checksum,postCleanupManifestChecksum:postCapture?.manifest.checksum,preservationFingerprint:createHash("sha256").update(baselineFingerprint).digest("hex").slice(0,16),preservationCertificate,evidence},null,2)}\n`)}

if(repairRunId)await repairStagingBaseline();else if(cleanupRunId)await recoverFailedRun();else await main();
