/**
 * READ-ONLY production check for the Polygon Showdown staging round: proves the
 * production schema has not moved. Every statement is a SELECT; nothing here can
 * write. Launched by scripts/audit-polygon-showdown-production.ps1, which loads
 * only the production project ref and database password.
 *
 * Prints redacted JSON, including digests of production's public and private
 * schema so two runs can be compared, and the deployment serving mathnexa.com.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const secrets = [];
const redact = (text) => secrets.reduce((value, secret) => (secret ? value.split(secret).join("[redacted]") : value), String(text ?? ""));
const ref = (process.env.SUPABASE_PRODUCTION_PROJECT_REF ?? "").trim().toLowerCase();
const password = process.env.SUPABASE_PRODUCTION_DB_PASSWORD ?? "";
if (!/^[a-z]{20}$/.test(ref) || ref === STAGING_PROJECT_REF) throw new Error("refusing: production project ref missing, malformed or staging");
if (password.length < 12) throw new Error("missing production database password");
secrets.push(password, encodeURIComponent(password));

const query = (url, statement) => spawnSync(process.execPath, [supabaseCli, "db", "query", "--db-url", url, "-o", "json", statement, "--yes"], { encoding: "utf8", env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } });
const rows = (output) => {
  const starts = [output.indexOf("["), output.indexOf("{")].filter((index) => index !== -1);
  const parsed = JSON.parse(output.slice(Math.min(...starts), Math.max(output.lastIndexOf("]"), output.lastIndexOf("}")) + 1));
  return Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.result ?? parsed.data ?? [];
};

const STATEMENT = `select
  current_setting('max_connections') as max_connections,
  current_setting('shared_buffers') as shared_buffers,
  (select count(*) from supabase_migrations.schema_migrations)::int as migration_count,
  (select max(version) from supabase_migrations.schema_migrations) as latest_migration,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'polygon!_%' escape '!')::int as polygon_tables,
  (select count(*) from pg_proc where pronamespace in ('public'::regnamespace, 'private'::regnamespace) and proname like 'polygon!_%' escape '!')::int as polygon_functions,
  (to_regprocedure('public.live_room_game_for_code(text)') is not null) as join_router_present,
  (select count(*) from public.game_catalog_entries where stable_key = 'polygon-showdown')::int as polygon_catalog_rows,
  (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as catalog,
  (select md5(string_agg(table_name || '.' || column_name || ':' || data_type, ',' order by table_name, column_name)) from information_schema.columns where table_schema = 'public') as public_columns_digest,
  (select md5(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), ',' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prokind = 'f') as functions_digest`;

let database = null;
for (const host of POOLER_HOSTS) {
  const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
  secrets.push(url);
  const result = query(url, STATEMENT);
  if (result.status === 0) {
    database = rows(`${result.stdout}`)[0];
    break;
  }
}
if (!database) throw new Error("production database unreachable");

const home = await fetch("https://mathnexa.com/", { redirect: "follow" }).then((response) => response.text()).catch(() => "");
const deployment = home.match(/dpl_[A-Za-z0-9]{10,}/)?.[0] ?? null;
const join = await fetch("https://mathnexa.com/join", { redirect: "manual" }).then((response) => response.status).catch(() => null);

console.log(redact(JSON.stringify({ target: "production (read only)", database, servingDeployment: deployment, joinStatus: join, at: new Date().toISOString() }, null, 2)));
