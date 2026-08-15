import { createServiceSupabaseClient } from "@/lib/supabase/service";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{resourceId:string;fileId:string}>}){
  const {resourceId,fileId}=await params;if(!/^[0-9a-f-]{36}$/i.test(resourceId)||!/^[0-9a-f-]{36}$/i.test(fileId))return new Response("Not Found",{status:404});
  const client=createServiceSupabaseClient();if(!client)return new Response("Not Found",{status:404});
  const resource=await client.from("content_resources").select("published_version_number").eq("id",resourceId).eq("publication_state","published").maybeSingle();
  if(resource.error||!resource.data)return new Response("Not Found",{status:404});
  const published=await client.from("content_resource_versions").select("source_version_id").eq("resource_id",resourceId).eq("version_number",resource.data.published_version_number).maybeSingle();if(published.error||!published.data)return new Response("Not Found",{status:404});const source=published.data.source_version_id?await client.from("content_resource_versions").select("version_number").eq("id",published.data.source_version_id).maybeSingle():null;const fileVersion=source?.data?.version_number??resource.data.published_version_number;
  const file=await client.from("resource_files").select("bucket_id,object_path,mime_type").eq("id",fileId).eq("resource_id",resourceId).eq("resource_version_number",fileVersion).eq("validation_state","accepted").in("file_role",["thumbnail","preview_image"]).maybeSingle();
  if(file.error||!file.data)return new Response("Not Found",{status:404});
  const signed=await client.storage.from(file.data.bucket_id).createSignedUrl(file.data.object_path,60);if(signed.error)return new Response("Not Found",{status:404});
  const fetched=await fetch(signed.data.signedUrl,{cache:"no-store"});if(!fetched.ok)return new Response("Not Found",{status:404});
  return new Response(fetched.body,{headers:{"Content-Type":file.data.mime_type,"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
}
