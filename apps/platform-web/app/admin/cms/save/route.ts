import { parseStructuredCmsDraft,isLegalCmsKey } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";
import { inspectAdminAccess,validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function value(form:FormData,name:string){return String(form.get(name)??"").trim()}
function redirectResult(request:Request,result:string){const url=new URL("/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);url.searchParams.set("section","cms");url.searchParams.set("cms",result);return NextResponse.redirect(url,303)}
export async function POST(request:Request){const access=await inspectAdminAccess();if(access.state!=="authorized")return new NextResponse("Not Found",{status:404});const form=await request.formData();if(!await validateAdminMutationCsrf(form))return redirectResult(request,"csrf-denied");
  let blocks:unknown;try{blocks=JSON.parse(value(form,"blocks"))}catch{return redirectResult(request,"invalid-structured-content")}
  const draft=parseStructuredCmsDraft({key:value(form,"key"),title:value(form,"title"),description:value(form,"description"),seoTitle:value(form,"seoTitle"),seoDescription:value(form,"seoDescription"),socialTitle:value(form,"socialTitle"),socialDescription:value(form,"socialDescription"),blocks});
  if(!draft)return redirectResult(request,"invalid-structured-content");const client=createServiceSupabaseClient();if(!client)return redirectResult(request,"failed-closed");
  const content={key:draft.key,title:draft.title,description:draft.description,seoTitle:draft.seoTitle,seoDescription:draft.seoDescription,socialTitle:draft.socialTitle,socialDescription:draft.socialDescription,blocks:draft.blocks};
  const seo={title:draft.seoTitle,description:draft.seoDescription,social_title:draft.socialTitle,social_description:draft.socialDescription};const documentId=value(form,"documentId");
  const response=documentId?await client.rpc("revise_cms_document",{p_actor_admin_id:access.admin.id,p_document_id:documentId,p_expected_lock_version:Number(value(form,"lockVersion")),p_content:content,p_seo_metadata:seo}):await client.rpc("create_cms_document",{p_actor_admin_id:access.admin.id,p_document_key:draft.key,p_document_kind:isLegalCmsKey(draft.key)?"legal":["featured-games","featured-homework","featured-quizzes","announcements","faq"].includes(draft.key)?"collection":["map-prep","navigation","footer"].includes(draft.key)?"configuration":"page",p_content:content,p_seo_metadata:seo});
  return redirectResult(request,response.error?"failed-closed":documentId?"revision-saved":"draft-saved");}
