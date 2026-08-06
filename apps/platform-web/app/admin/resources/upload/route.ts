import { normalizeContentTags,parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { inspectAdminAccess,validateAdminMutationCsrf } from "@/lib/admin/session";
import { storeResourceFile } from "@/lib/admin/resource-file-storage";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const runtime="nodejs";
type ServiceClient=NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
function safeRedirect(request:Request,kind:string,status:string,resourceId?:string){const target=new URL(resourceId?`/admin/resources/${resourceId}`:"/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);target.searchParams.set(resourceId?"kind":"section",kind==="quizzes"?"quizzes":"homework");target.searchParams.set(resourceId?"result":"upload",status);return NextResponse.redirect(target,303)}
const value=(form:FormData,name:string)=>String(form.get(name)??"").trim();
function integer(form:FormData,name:string,minimum:number,maximum:number){const parsed=Number(value(form,name));return Number.isSafeInteger(parsed)&&parsed>=minimum&&parsed<=maximum?parsed:null}
function file(form:FormData,name:string){const item=form.get(name);return item instanceof File&&item.size>0?item:null}
async function createResource(input:Readonly<{client:ServiceClient;adminId:string;kind:"homework"|"quizzes";scopeId:string;resourceType:string;slug:string;sortOrder:number;title:string;description:string;tags:readonly string[];manifest:Record<string,unknown>}>){
  const params={p_actor_admin_id:input.adminId,p_resource_type:input.resourceType,p_slug:input.slug,p_sort_order:input.sortOrder,p_title:input.title,p_description:input.description,p_thumbnail_path:null,p_tags:input.tags,p_content_manifest:input.manifest};
  const created=input.kind==="homework"?await input.client.rpc("create_content_resource",{...params,p_lesson_id:input.scopeId}):await input.client.rpc("create_topic_content_resource",{...params,p_topic_id:input.scopeId});
  if(created.error||typeof created.data!=="string")throw new Error("Resource draft creation failed.");return created.data;
}
export async function POST(request:Request){
  const access=await inspectAdminAccess();if(access.state!=="authorized")return new NextResponse("Not Found",{status:404});const form=await request.formData();const kind=value(form,"kind");
  if(!await validateAdminMutationCsrf(form))return safeRedirect(request,kind,"csrf-denied");
  if(kind!=="homework"&&kind!=="quizzes")return safeRedirect(request,kind,"invalid-input");
  const scopeId=value(form,kind==="homework"?"lessonId":"topicId"),title=value(form,"title"),description=value(form,"description"),slug=parseContentSlug(value(form,"slug")),sortOrder=integer(form,"sortOrder",1,32766),minutes=integer(form,"minutes",1,240),difficulty=value(form,"difficulty"),tags=normalizeContentTags(value(form,"tags").split(",").filter(Boolean)),primary=file(form,"primaryPdf");
  if(!/^[0-9a-f-]{36}$/i.test(scopeId)||!slug||!sortOrder||!minutes||!["core","support","challenge"].includes(difficulty)||!tags||!primary||title.length<1||title.length>160||description.length>4000)return safeRedirect(request,kind,"invalid-input");
  const client=createServiceSupabaseClient();if(!client)return safeRedirect(request,kind,"unavailable");let primaryId:string|undefined;
  try{
    const primaryType=kind==="homework"?"homework_pdf":"quiz_pdf";primaryId=await createResource({client,adminId:access.admin.id,kind,scopeId,resourceType:primaryType,slug,sortOrder,title,description,tags,manifest:{difficulty,estimated_minutes:minutes,asset_kind:"interactive_pdf"}});
    const results=[await storeResourceFile({client,adminId:access.admin.id,resourceId:primaryId,resourceVersion:1,role:"primary_pdf",upload:primary})];const answer=file(form,"answerPdf");
    if(answer){const answerId=await createResource({client,adminId:access.admin.id,kind,scopeId,resourceType:kind==="homework"?"homework_answer_key":"quiz_answer_key",slug:`${slug}-answer-key`,sortOrder:sortOrder+1,title:`${title} answer key`,description:`Answer key for ${title}.`,tags,manifest:{difficulty,estimated_minutes:minutes,asset_kind:"answer_key_pdf"}});results.push(await storeResourceFile({client,adminId:access.admin.id,resourceId:answerId,resourceVersion:1,role:"answer_key_pdf",upload:answer}))}
    const thumbnail=file(form,"thumbnail");if(thumbnail)results.push(await storeResourceFile({client,adminId:access.admin.id,resourceId:primaryId,resourceVersion:1,role:"thumbnail",upload:thumbnail}));for(const preview of form.getAll("previews"))if(preview instanceof File&&preview.size>0)results.push(await storeResourceFile({client,adminId:access.admin.id,resourceId:primaryId,resourceVersion:1,role:"preview_image",upload:preview}));
    return safeRedirect(request,kind,results.some((result)=>result.decision==="quarantined")?"quarantined":"saved",primaryId);
  }catch{return safeRedirect(request,kind,"failed-closed",primaryId)}
}
