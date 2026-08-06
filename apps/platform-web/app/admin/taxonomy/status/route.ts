import { parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function back(request:Request,section:string,result:string){const target=new URL("/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);target.searchParams.set("section",section==="quizzes"?"quizzes":"homework");target.searchParams.set("taxonomy",result);return NextResponse.redirect(target,303)}

export async function POST(request:Request){
  const access=await inspectAdminAccess();if(access.state!=="authorized")return new NextResponse("Not Found",{status:404});
  const form=await request.formData();const section=String(form.get("section")??"");if(!await validateAdminMutationCsrf(form))return back(request,section,"csrf-denied");
  const kind=String(form.get("kind")??""),itemId=String(form.get("itemId")??""),title=String(form.get("title")??"").trim(),slug=parseContentSlug(String(form.get("slug")??"")),sortOrder=Number(form.get("sortOrder")),lockVersion=Number(form.get("lockVersion")),targetState=String(form.get("targetState")??"");
  if(!["grade","topic","lesson"].includes(kind)||!/^[0-9a-f-]{36}$/i.test(itemId)||!slug||title.length<1||title.length>160||!Number.isSafeInteger(sortOrder)||sortOrder<1||sortOrder>32767||!Number.isSafeInteger(lockVersion)||!["validating","ready_for_review","published","archived"].includes(targetState))return back(request,section,"invalid-input");
  const client=createServiceSupabaseClient();if(!client)return back(request,section,"failed-closed");
  const common={p_actor_admin_id:access.admin.id,p_expected_lock_version:lockVersion,p_title:title,p_slug:slug,p_sort_order:sortOrder,p_publication_state:targetState};
  const changed=kind==="grade"?await client.rpc("update_content_grade",{...common,p_grade_id:itemId}):kind==="topic"?await client.rpc("update_content_topic",{...common,p_topic_id:itemId}):await client.rpc("update_content_lesson",{...common,p_lesson_id:itemId});
  return back(request,section,changed.error?"failed-closed":"updated");
}
