import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{encoding:"utf8"}).split(/\r?\n/).filter(Boolean);
const text=(p)=>readFileSync(p,"utf8");
for(const path of files.filter(p=>/\.(?:ts|tsx|mjs|sql|md|example)$/.test(p)&&!/(?:\.test\.|\/tests\/|^e2e\/)/.test(p))){const source=text(path);if(/(?:sk|pk)_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}/.test(source))throw new Error(`Live or webhook credential found outside deterministic test fixtures: ${path}`);}
const core=text("packages/platform-core/src/environment/registry.ts"); if(/supabase|stripe|react|next|window|document|process\./i.test(core))throw new Error("Environment core is provider or browser coupled");
const adapter=text("apps/platform-web/lib/environment/server.ts"); if(!adapter.startsWith('import "server-only";'))throw new Error("Environment adapter is not server-only");
if(/NEXT_PUBLIC_MVH_(?:APP_ENVIRONMENT|STRIPE_MODE|DELETION_MODE)/.test(adapter))throw new Error("Browser environment state has authority");
const migration=text("supabase/migrations/20260727200000_phase4_preview_readiness.sql");if(!migration.includes("destructive_execution_disabled")||/grant execute on function private\.advance_account_deletion[^\n]+authenticated/.test(migration))throw new Error("Deletion execution boundary is unsafe");
const health=text("apps/platform-web/app/api/health/route.ts");if(/SUPABASE|STRIPE|SECRET|TOKEN|process\.env/.test(health))throw new Error("Health endpoint exposes implementation details");
console.log(`Phase 4 security audit passed: ${files.length} files scanned; environment, deletion, health, and live-key boundaries verified.`);
