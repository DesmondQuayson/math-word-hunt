import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function back(request: Request, kind: string, result: string) { const target = new URL("/admin", process.env.MVH_APPLICATION_ORIGIN ?? request.url); target.searchParams.set("section", kind === "quizzes" ? "quizzes" : "homework"); target.searchParams.set("publish", result); return NextResponse.redirect(target, 303); }
export async function POST(request: Request) {
  const access = await inspectAdminAccess(); if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const form = await request.formData(); const kind = String(form.get("kind") ?? ""); if (!await validateAdminMutationCsrf(form)) return back(request, kind, "csrf-denied");
  const resourceId=String(form.get("resourceId")??""), targetState=String(form.get("targetState")??""); const versionNumber=Number(form.get("versionNumber")),lockVersion=Number(form.get("lockVersion"));
  if(!/^[0-9a-f-]{36}$/i.test(resourceId)||!Number.isSafeInteger(versionNumber)||!Number.isSafeInteger(lockVersion)||!["validating","ready_for_review","published"].includes(targetState))return back(request,kind,"invalid-input");
  const client=createServiceSupabaseClient();if(!client)return back(request,kind,"failed-closed");
  const changed=await client.rpc("transition_content_resource",{p_actor_admin_id:access.admin.id,p_resource_id:resourceId,p_version_number:versionNumber,p_expected_lock_version:lockVersion,p_publication_state:targetState});
  return back(request,kind,changed.error?"failed-closed":targetState);
}
