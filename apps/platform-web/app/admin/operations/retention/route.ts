import { NextResponse } from "next/server";
import { adminAccessDeniedResponse } from "@/lib/admin/access-response";
import { inspectAdminAccess,validateAdminMutationCsrf } from "@/lib/admin/session";
import { ensureAdminStepUp } from "@/lib/admin/step-up";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
const back=(request:Request,result:string)=>{const url=new URL("/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);url.searchParams.set("section","settings");url.searchParams.set("ops",result);return NextResponse.redirect(url,303)};
export async function POST(request:Request){const access=await inspectAdminAccess();if(access.state!=="authorized")return adminAccessDeniedResponse(request, access);const form=await request.formData();if(!await validateAdminMutationCsrf(form, access.session))return back(request,"csrf-denied");const reason=String(form.get("reason")??"").trim();if(form.get("confirm")!=="retention"||reason.length<3||reason.length>500)return back(request,"invalid-input");
  // Deleting data needs a fresh TOTP step-up; the database checks it again.
  const stepUp=await ensureAdminStepUp({admin:access.admin,session:access.session,code:String(form.get("stepUpCode")??"")});if(stepUp!=="fresh"&&stepUp!=="verified")return back(request,`step-up-${stepUp}`);
  const client=createServiceSupabaseClient();if(!client)return back(request,"unavailable");const result=await client.rpc("run_platform_analytics_retention",{p_admin_user_id:access.admin.id,p_admin_session_id:access.session.id,p_reason:reason});return back(request,result.error?result.error.message.toLowerCase().includes("fresh")?"step-up-required":"operation-failed":"retention-completed")}
