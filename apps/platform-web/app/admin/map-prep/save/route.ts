import { parseMapPrepDestination } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { checkAdminExternalDestination } from "@/lib/admin/external-destination-health";
import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function back(request:Request,result:string){const target=new URL("/admin",process.env.MVH_APPLICATION_ORIGIN??request.url);target.searchParams.set("section","map-prep");target.searchParams.set("map",result);return NextResponse.redirect(target,303)}

export async function POST(request:Request){
  const access=await inspectAdminAccess();if(access.state!=="authorized")return new NextResponse("Not Found",{status:404});
  const form=await request.formData();if(!await validateAdminMutationCsrf(form))return back(request,"csrf-denied");
  const allowedHost=String(form.get("allowedHost")??"").trim().toLowerCase();const destinationUrl=String(form.get("destinationUrl")??"");const adminDestinationUrl=String(form.get("adminDestinationUrl")??"");
  const health=await checkAdminExternalDestination(destinationUrl,allowedHost);if(health.state!=="verified")return back(request,health.state==="unsafe"?"invalid-destination":"health-check-failed");
  const destination=parseMapPrepDestination({label:String(form.get("label")??""),publicDescription:String(form.get("publicDescription")??""),destinationUrl,adminDestinationUrl,enabled:form.get("enabled")==="true",openMode:String(form.get("openMode")??"")},health.checkedAt);
  if(!destination||destination.allowedHosts.some((host)=>host!==allowedHost))return back(request,"invalid-destination");
  const client=createServiceSupabaseClient();if(!client)return back(request,"failed-closed");
  const content={key:"map-prep",title:destination.label,description:destination.publicDescription,seoTitle:destination.label,seoDescription:destination.publicDescription,socialTitle:destination.label,socialDescription:destination.publicDescription,blocks:[{type:"external-link",href:destination.destinationUrl,...destination,lastHealthCheck:health.checkedAt,healthStatus:health.state,healthStatusCode:health.statusCode}]};
  const seo={title:destination.label,description:destination.publicDescription,social_title:destination.label,social_description:destination.publicDescription};const documentId=String(form.get("documentId")??"");
  const response=documentId?await client.rpc("revise_cms_document",{p_actor_admin_id:access.admin.id,p_document_id:documentId,p_expected_lock_version:Number(form.get("lockVersion")),p_content:content,p_seo_metadata:seo}):await client.rpc("create_cms_document",{p_actor_admin_id:access.admin.id,p_document_key:"map-prep",p_document_kind:"configuration",p_content:content,p_seo_metadata:seo});
  return back(request,response.error?"failed-closed":documentId?"revision-saved":"draft-saved");
}
