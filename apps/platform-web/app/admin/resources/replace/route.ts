import { NextResponse } from "next/server";

import { storeResourceFile } from "@/lib/admin/resource-file-storage";
import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function back(request: Request, kind: string, result: string) {
  const target = new URL("/admin", process.env.MVH_APPLICATION_ORIGIN ?? request.url);
  target.searchParams.set("section", kind === "quizzes" ? "quizzes" : "homework");
  target.searchParams.set("upload", result);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  if (!await validateAdminMutationCsrf(form)) return back(request, kind, "csrf-denied");
  const resourceId = String(form.get("resourceId") ?? "");
  const fileId = String(form.get("fileId") ?? "");
  const upload = form.get("replacement");
  if (!/^[0-9a-f-]{36}$/i.test(resourceId) || !/^[0-9a-f-]{36}$/i.test(fileId) || !(upload instanceof File) || upload.size < 1) return back(request, kind, "invalid-input");
  const client = createServiceSupabaseClient();
  if (!client) return back(request, kind, "failed-closed");
  const [resource, currentFile] = await Promise.all([
    client.from("content_resources").select("current_version_number,publication_state").eq("id", resourceId).maybeSingle(),
    client.from("resource_files").select("id,resource_version_number,file_role,validation_state").eq("id", fileId).eq("resource_id", resourceId).maybeSingle()
  ]);
  if (resource.error || currentFile.error || !resource.data || !currentFile.data || resource.data.publication_state !== "draft" ||
      currentFile.data.validation_state !== "accepted" || currentFile.data.resource_version_number !== resource.data.current_version_number ||
      !["primary_pdf", "answer_key_pdf", "thumbnail", "preview_image"].includes(currentFile.data.file_role)) return back(request, kind, "failed-closed");
  try {
    const stored = await storeResourceFile({ client, adminId: access.admin.id, resourceId, resourceVersion: resource.data.current_version_number,
      role: currentFile.data.file_role as "primary_pdf" | "answer_key_pdf" | "thumbnail" | "preview_image", upload, replacesFileId: fileId });
    return back(request, kind, stored.decision === "accepted" ? "replaced" : "quarantined-replacement");
  } catch { return back(request, kind, "failed-closed"); }
}
