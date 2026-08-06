import { normalizeContentTags,parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { checkAdminExternalDestination } from "@/lib/admin/external-destination-health";
import { inspectAdminAccess,validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function back(request:Request,result:string){const target=new URL("/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);target.searchParams.set("section","games");target.searchParams.set("package",result);return NextResponse.redirect(target,303)}
const value=(form:FormData,name:string)=>String(form.get(name)??"").trim();
const optionalGrade=(form:FormData,name:string)=>{const raw=value(form,name);if(!raw)return null;const parsed=Number(raw);return Number.isSafeInteger(parsed)&&parsed>=1&&parsed<=12?parsed:null};

export async function POST(request:Request){
  const access=await inspectAdminAccess();if(access.state!=="authorized")return new NextResponse("Not Found",{status:404});
  const form=await request.formData();if(!await validateAdminMutationCsrf(form))return back(request,"csrf-denied");
  const slug=parseContentSlug(value(form,"slug")),title=value(form,"title"),description=value(form,"description"),externalUrl=value(form,"externalUrl"),allowedHost=value(form,"allowedHost").toLowerCase();
  const thumbnailReference=value(form,"thumbnailReference"),difficulty=value(form,"difficulty"),displayOrder=Number(value(form,"displayOrder"));
  const gradeMin=optionalGrade(form,"recommendedGradeMin"),gradeMax=optionalGrade(form,"recommendedGradeMax");
  const skills=normalizeContentTags(value(form,"skills").split(",").filter(Boolean)),topics=normalizeContentTags(value(form,"topics").split(",").filter(Boolean)),tags=normalizeContentTags(value(form,"tags").split(",").filter(Boolean));
  if(!slug||title.length<1||title.length>160||description.length<1||description.length>4000||!/^(?:builtin|media):[a-z0-9][a-z0-9:._-]{0,500}$/i.test(thumbnailReference)||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(allowedHost)||!skills||!topics||!tags||
    !["support","core","challenge","adaptive"].includes(difficulty)||!Number.isSafeInteger(displayOrder)||displayOrder<1||displayOrder>32767||
    (value(form,"recommendedGradeMin")!==""&&gradeMin===null)||(value(form,"recommendedGradeMax")!==""&&gradeMax===null)||(gradeMin!==null&&gradeMax!==null&&gradeMax<gradeMin))return back(request,"invalid-input");
  const health=await checkAdminExternalDestination(externalUrl,allowedHost);if(health.state!=="verified")return back(request,health.state==="unsafe"?"unsafe-destination":"destination-unreachable");
  const client=createServiceSupabaseClient();if(!client)return back(request,"failed-closed");
  const created=await client.rpc("create_external_game_catalog_entry",{p_actor_admin_id:access.admin.id,p_slug:slug,p_title:title,p_description:description,p_external_url:externalUrl,p_allowed_host:allowedHost,p_thumbnail_reference:thumbnailReference,p_recommended_grade_min:gradeMin,p_recommended_grade_max:gradeMax,p_skills:skills,p_topics:topics,p_tags:tags,p_difficulty:difficulty,p_display_order:displayOrder});
  return back(request,created.error?"failed-closed":"external-saved");
}
