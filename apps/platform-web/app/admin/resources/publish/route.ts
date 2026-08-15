import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function redirectTo(request: Request, kind: string, publish: string) {
  const target = new URL("/admin",process.env.MVH_APPLICATION_ORIGIN ?? request.url); target.searchParams.set("section",kind === "quizzes" ? "quizzes" : "homework"); target.searchParams.set("publish",publish);
  return NextResponse.redirect(target,303);
}

export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found",{status:404});
  const form = await request.formData(); const kind = String(form.get("kind") ?? "");
  if (!await validateAdminMutationCsrf(form)) return redirectTo(request,kind,"csrf-denied");
  const resourceId = String(form.get("resourceId") ?? ""); const versionNumber=Number(form.get("versionNumber")); let lockVersion=Number(form.get("lockVersion"));
  if (!/^[0-9a-f-]{36}$/i.test(resourceId) || !Number.isSafeInteger(versionNumber) || !Number.isSafeInteger(lockVersion)) return redirectTo(request,kind,"invalid-input");
  const client=createServiceSupabaseClient(); if(!client) return redirectTo(request,kind,"unavailable");
  try {
    for (const state of ["validating","ready_for_review","published"] as const) {
      const changed=await client.rpc("transition_content_resource",{p_actor_admin_id:access.admin.id,p_resource_id:resourceId,p_version_number:versionNumber,p_expected_lock_version:lockVersion,p_publication_state:state});
      if(changed.error || typeof changed.data!=="number") throw new Error("Publication transition failed"); lockVersion=changed.data;
    }
    return redirectTo(request,kind,"published");
  } catch { return redirectTo(request,kind,"failed-closed"); }
}
