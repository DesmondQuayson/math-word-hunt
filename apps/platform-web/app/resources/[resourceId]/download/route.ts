import { getGameAccessView } from "@/lib/game-access/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{resourceId:string}>}){
  const resourceId=(await params).resourceId;if(!/^[0-9a-f-]{36}$/i.test(resourceId))return Response.json({error:"not-found"},{status:404});
  const access=await getGameAccessView();if(!access.decision.allowed||!access.principal)return Response.json({error:"resource-access-denied",reason:access.decision.reason,nextAction:access.decision.nextAction},{status:401,headers:{"Cache-Control":"no-store"}});
  const client=createServiceSupabaseClient();if(!client)return Response.json({error:"unavailable"},{status:503});
  const resource=await client.from("content_resources").select("published_version_number,resource_type").eq("id",resourceId).eq("publication_state","published").maybeSingle();
  if(resource.error||!resource.data)return Response.json({error:"not-found"},{status:404});
  const expectedRole=resource.data.resource_type.includes("answer_key")?"answer_key_pdf":"primary_pdf";
  const published=await client.from("content_resource_versions").select("source_version_id").eq("resource_id",resourceId).eq("version_number",resource.data.published_version_number).maybeSingle();if(published.error||!published.data)return Response.json({error:"not-found"},{status:404});
  const source=published.data.source_version_id?await client.from("content_resource_versions").select("version_number").eq("id",published.data.source_version_id).maybeSingle():null;const fileVersion=source?.data?.version_number??resource.data.published_version_number;
  const file=await client.from("resource_files").select("id,bucket_id,object_path,mime_type,normalized_filename").eq("resource_id",resourceId).eq("resource_version_number",fileVersion).eq("file_role",expectedRole).eq("validation_state","accepted").maybeSingle();
  if(file.error||!file.data)return Response.json({error:"not-found"},{status:404});
  if(access.principal.kind==="consumer"){
    const authorized=await client.rpc("record_resource_download",{p_consumer_user_id:access.principal.id,p_resource_file_id:file.data.id});
    if(authorized.error||authorized.data!==true)return Response.json({error:"resource-access-denied"},{status:403,headers:{"Cache-Control":"no-store"}});
  }
  const signed=await client.storage.from(file.data.bucket_id).createSignedUrl(file.data.object_path,60);if(signed.error)return Response.json({error:"unavailable"},{status:503});
  const fetched=await fetch(signed.data.signedUrl,{cache:"no-store"});if(!fetched.ok||!fetched.body)return Response.json({error:"unavailable"},{status:503});
  return new Response(fetched.body,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${file.data.normalized_filename.replace(/["\\\r\n]/g,"")}"`,"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Referrer-Policy":"no-referrer"}});
}
