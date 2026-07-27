import { createClient } from "@supabase/supabase-js";
const execute=process.argv.includes("--execute");
if(execute) throw new Error("Destructive account deletion is disabled in Phase 4. Owner-approved retention policy and a later migration are required.");
const owner=process.argv.find((value)=>value.startsWith("--owner="))?.slice(8);
if(!owner){console.log("Deletion planner dry run: provide --owner=<teacher UUID> with owner-controlled local configuration. No data changed.");process.exit(0);}
if(!/^[0-9a-f-]{36}$/i.test(owner)) throw new Error("A valid owner UUID is required");
const url=process.env.SUPABASE_URL; const secret=process.env.SUPABASE_SECRET_KEY;
if(!url||!secret) throw new Error("Server-only local database configuration is required");
const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await client.from("account_deletion_requests").select("id,lifecycle_state,idempotency_key,requested_at").eq("owner_teacher_id",owner).eq("status","requested").maybeSingle();
if(error) throw new Error("Deletion plan lookup failed");
console.log(JSON.stringify({mode:"dry-run",ownerScoped:true,request:data??null,destructiveExecutionEnabled:false,actions:data?["classes:delete","activities:delete","billing:anonymize","audit:minimize","identity:provider-approved-delete"]:[]},null,2));

