import { normalizeContentTags,parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { checkAdminExternalDestination } from "@/lib/admin/external-destination-health";
import { inspectAdminAccess,validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function back(request:Request,result:string){const target=new URL("/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);target.searchParams.set("section","games");target.searchParams.set("package",result);return NextResponse.redirect(target,303)}
const value=(form:FormData,name:string)=>String(form.get(name)??"").trim();
const grade=(form:FormData,name:string)=>{const raw=value(form,name);if(!raw)return null;const parsed=Number(raw);return Number.isSafeInteger(parsed)&&parsed>=1&&parsed<=12?parsed:null};
export async function POST(request:Request){
  const access=await inspectAdminAccess();if(access.state!=="authorized")return new NextResponse("Not Found",{status:404});
  const form=await request.formData();if(!await validateAdminMutationCsrf(form))return back(request,"csrf-denied");
  const catalogId=value(form,"catalogId"),launchType=value(form,"launchType"),lockVersion=Number(value(form,"lockVersion")),slug=parseContentSlug(value(form,"slug"));
  const title=value(form,"title"),description=value(form,"description"),thumbnailReference=value(form,"thumbnailReference"),difficulty=value(form,"difficulty"),displayOrder=Number(value(form,"displayOrder"));
  const gradeMin=grade(form,"recommendedGradeMin"),gradeMax=grade(form,"recommendedGradeMax"),skills=normalizeContentTags(value(form,"skills").split(",").filter(Boolean)),topics=normalizeContentTags(value(form,"topics").split(",").filter(Boolean)),tags=normalizeContentTags(value(form,"tags").split(",").filter(Boolean));
  const externalUrl=launchType==="external_https"?value(form,"externalUrl"):null,allowedHost=launchType==="external_https"?value(form,"allowedHost").toLowerCase():null;
  if(!/^[0-9a-f-]{36}$/i.test(catalogId)||!Number.isSafeInteger(lockVersion)||!slug||title.length<1||title.length>160||description.length<1||description.length>4000||
    !/^(?:builtin|media|package):[a-z0-9][a-z0-9:._-]{0,500}$/i.test(thumbnailReference)||!skills||!topics||!tags||!["support","core","challenge","adaptive","mixed"].includes(difficulty)||
    !Number.isSafeInteger(displayOrder)||displayOrder<1||displayOrder>32767||(value(form,"recommendedGradeMin")!==""&&gradeMin===null)||(value(form,"recommendedGradeMax")!==""&&gradeMax===null)||(gradeMin!==null&&gradeMax!==null&&gradeMax<gradeMin))return back(request,"invalid-input");
  if(externalUrl&&allowedHost){const health=await checkAdminExternalDestination(externalUrl,allowedHost);if(health.state!=="verified")return back(request,health.state==="unsafe"?"unsafe-destination":"destination-unreachable");}
  const client=createServiceSupabaseClient();if(!client)return back(request,"failed-closed");
  const changed=await client.rpc("update_game_catalog_entry",{p_actor_admin_id:access.admin.id,p_catalog_entry_id:catalogId,p_expected_lock_version:lockVersion,p_slug:slug,p_title:title,p_description:description,p_thumbnail_reference:thumbnailReference,p_recommended_grade_min:gradeMin,p_recommended_grade_max:gradeMax,p_skills:skills,p_topics:topics,p_tags:tags,p_difficulty:difficulty,p_display_order:displayOrder,p_external_url:externalUrl,p_allowed_host:allowedHost});
  return back(request,changed.error?"failed-closed":"catalog-updated");
}
