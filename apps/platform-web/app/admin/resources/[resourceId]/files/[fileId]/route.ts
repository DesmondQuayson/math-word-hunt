import { NextResponse } from "next/server";

import { inspectAdminAccess } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{resourceId:string;fileId:string}>}){
  const access=await inspectAdminAccess();if(access.state!=="authorized")return new NextResponse("Not Found",{status:404});
  const {resourceId,fileId}=await params;if(!/^[0-9a-f-]{36}$/i.test(resourceId)||!/^[0-9a-f-]{36}$/i.test(fileId))return new NextResponse("Not Found",{status:404});
  const client=createServiceSupabaseClient();if(!client)return new NextResponse("Not Found",{status:404});
  const file=await client.from("resource_files").select("bucket_id,object_path,mime_type,normalized_filename,validation_state").eq("id",fileId).eq("resource_id",resourceId).eq("validation_state","accepted").maybeSingle();
  if(file.error||!file.data)return new NextResponse("Not Found",{status:404});const object=await client.storage.from(file.data.bucket_id).download(file.data.object_path);if(object.error)return new NextResponse("Not Found",{status:404});
  return new NextResponse(await object.data.arrayBuffer(),{headers:{"Content-Type":file.data.mime_type,"Content-Disposition":`inline; filename="${file.data.normalized_filename.replace(/["\\\r\n]/g,"")}"`,"Cache-Control":"private, no-store","Content-Security-Policy":"default-src 'none'; sandbox","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}})
}
