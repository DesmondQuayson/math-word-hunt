import { NextResponse } from "next/server";
import { parseAdminFeatureFlagAction } from "@math-vocabulary-hunt/platform-core";
import { adminAccessDeniedResponse } from "@/lib/admin/access-response";
import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { ensureAdminStepUp, STEP_UP_FEATURE_FLAGS } from "@/lib/admin/step-up";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const back=(request:Request,result:string)=>{const url=new URL("/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);url.searchParams.set("section","settings");url.searchParams.set("ops",result);return NextResponse.redirect(url,303)};
export async function POST(request:Request){const access=await inspectAdminAccess();if(access.state!=="authorized")return adminAccessDeniedResponse(request, access);const form=await request.formData();if(!await validateAdminMutationCsrf(form, access.session))return back(request,"csrf-denied");const input=parseAdminFeatureFlagAction(Object.fromEntries(["flag","enabled","expectedVersion","message","reason"].map(key=>[key,String(form.get(key)??"")])));if(!input)return back(request,"invalid-input");if(input.flag.includes("emergency")&&form.get("confirm")!==input.flag)return back(request,"confirmation-required");
  // Emergency controls need a fresh TOTP step-up; the database checks it again.
  if(STEP_UP_FEATURE_FLAGS.has(input.flag)){const stepUp=await ensureAdminStepUp({admin:access.admin,session:access.session,code:String(form.get("stepUpCode")??"")});if(stepUp!=="fresh"&&stepUp!=="verified")return back(request,`step-up-${stepUp}`)}
  const client=createServiceSupabaseClient();if(!client)return back(request,"unavailable");const result=await client.rpc("set_platform_feature_flag",{p_admin_user_id:access.admin.id,p_admin_session_id:access.session.id,p_flag_key:input.flag,p_enabled:input.enabled,p_message:input.message,p_reason:input.reason,p_expected_version:input.expectedVersion});return back(request,result.error?result.error.message.toLowerCase().includes("fresh")?"step-up-required":"operation-failed":"flag-updated")}
