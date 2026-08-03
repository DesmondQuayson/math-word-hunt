import { createHash, randomUUID } from "node:crypto";

import { inspectImageUpload, inspectPdfUpload, normalizeContentTags, parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ServiceClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

function safeRedirect(request: Request, kind: string, status: string): NextResponse {
  const target = new URL("/admin", process.env.MVH_APPLICATION_ORIGIN ?? request.url);
  target.searchParams.set("section", kind === "quizzes" ? "quizzes" : "homework");
  target.searchParams.set("upload", status);
  return NextResponse.redirect(target, 303);
}

function value(form: FormData, name: string): string { return String(form.get(name) ?? "").trim(); }
function integer(form: FormData, name: string, minimum: number, maximum: number): number | null {
  const parsed = Number(value(form,name)); return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
function file(form: FormData, name: string): File | null {
  const item = form.get(name); return item instanceof File && item.size > 0 ? item : null;
}

async function storeFile(input: Readonly<{
  client: ServiceClient; adminId: string; resourceId: string; role: "primary_pdf"|"answer_key_pdf"|"thumbnail"|"preview_image"; upload: File;
}>) {
  if (input.upload.size > 20*1024*1024) return { decision: "quarantined" as const, stored: false };
  const bytes = new Uint8Array(await input.upload.arrayBuffer());
  const isPdf = input.role === "primary_pdf" || input.role === "answer_key_pdf";
  const pdfInspection = isPdf ? inspectPdfUpload({ filename: input.upload.name, mimeType: input.upload.type, bytes }) : null;
  const imageInspection = isPdf ? null : inspectImageUpload({ filename: input.upload.name, mimeType: input.upload.type, bytes });
  const decision = pdfInspection?.decision ?? imageInspection!.decision;
  const accepted = decision === "accepted";
  const bucket = accepted ? "resource-files" : "resource-quarantine";
  const prefix = accepted ? "resources" : "quarantine";
  const normalizedFilename = pdfInspection?.normalizedFilename ?? imageInspection!.normalizedFilename;
  const objectPath = `${prefix}/${input.resourceId}/v1/${randomUUID()}-${normalizedFilename}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const detectedMime = isPdf ? "application/pdf" : imageInspection!.mimeType ?? "application/octet-stream";
  const uploaded = await input.client.storage.from(bucket).upload(objectPath, bytes, {
    contentType: accepted ? detectedMime : "application/octet-stream", upsert: false, cacheControl: "private, max-age=0"
  });
  if (uploaded.error) throw new Error("Private resource upload failed.");
  const report = pdfInspection
    ? { validator: "phase8d-pdf-structure-v1", findings: pdfInspection.findings, acroform: pdfInspection.hasAcroForm, malware_scan: "structural-fail-closed" }
    : { validator: "phase8d-image-magic-v1", findings: imageInspection!.findings, width: imageInspection!.width, height: imageInspection!.height, malware_scan: "structural-fail-closed" };
  const registered = await input.client.rpc("register_resource_file", {
    p_actor_admin_id: input.adminId,
    p_resource_id: input.resourceId,
    p_resource_version_number: 1,
    p_file_role: input.role,
    p_original_filename: input.upload.name.slice(0,255),
    p_normalized_filename: normalizedFilename,
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_mime_type: accepted ? detectedMime : "application/octet-stream",
    p_byte_size: bytes.byteLength,
    p_sha256: sha256,
    p_validation_state: accepted ? "accepted" : "quarantined",
    p_validation_report: report,
    p_replaces_file_id: null
  });
  if (registered.error) {
    await input.client.storage.from(bucket).remove([objectPath]);
    throw new Error("Resource validation evidence could not be registered.");
  }
  return { decision, stored: true };
}

async function createResource(input: Readonly<{
  client: ServiceClient; adminId: string; lessonId: string; resourceType: string; slug: string; sortOrder: number;
  title: string; description: string; tags: readonly string[]; manifest: Record<string,unknown>;
}>): Promise<string> {
  const created = await input.client.rpc("create_content_resource", {
    p_actor_admin_id: input.adminId, p_lesson_id: input.lessonId, p_resource_type: input.resourceType,
    p_slug: input.slug, p_sort_order: input.sortOrder, p_title: input.title, p_description: input.description,
    p_thumbnail_path: null, p_tags: input.tags, p_content_manifest: input.manifest
  });
  if (created.error || typeof created.data !== "string") throw new Error("Resource draft creation failed.");
  return created.data;
}

export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const form = await request.formData();
  if (!await validateAdminMutationCsrf(form)) return safeRedirect(request,value(form,"kind"),"csrf-denied");
  const kind = value(form,"kind"); const lessonId = value(form,"lessonId"); const title = value(form,"title");
  const description = value(form,"description"); const slug = parseContentSlug(value(form,"slug"));
  const sortOrder = integer(form,"sortOrder",1,32766); const minutes = integer(form,"minutes",1,240);
  const difficulty = value(form,"difficulty"); const tags = normalizeContentTags(value(form,"tags").split(",").filter(Boolean));
  const primary = file(form,"primaryPdf");
  if (!(["homework","quizzes"].includes(kind)) || !/^[0-9a-f-]{36}$/i.test(lessonId) || !slug || !sortOrder || !minutes ||
      !["core","support","challenge"].includes(difficulty) || !tags || !primary || title.length<1 || title.length>160 || description.length>4000) {
    return safeRedirect(request,kind,"invalid-input");
  }
  const client = createServiceSupabaseClient();
  if (!client) return safeRedirect(request,kind,"unavailable");
  try {
    const primaryType = kind === "homework" ? "homework_pdf" : "quiz_pdf";
    const primaryId = await createResource({ client, adminId:access.admin.id, lessonId, resourceType:primaryType, slug, sortOrder,
      title, description, tags, manifest:{ difficulty, estimated_minutes:minutes, asset_kind:"interactive_pdf" } });
    const results = [await storeFile({ client,adminId:access.admin.id,resourceId:primaryId,role:"primary_pdf",upload:primary })];
    const answer = file(form,"answerPdf");
    if (answer) {
      const answerId = await createResource({ client,adminId:access.admin.id,lessonId,
        resourceType:kind === "homework" ? "homework_answer_key" : "quiz_answer_key",slug:`${slug}-answer-key`,sortOrder:sortOrder+1,
        title:`${title} answer key`,description:`Answer key for ${title}.`,tags,manifest:{ difficulty,estimated_minutes:minutes,asset_kind:"answer_key_pdf" } });
      results.push(await storeFile({ client,adminId:access.admin.id,resourceId:answerId,role:"answer_key_pdf",upload:answer }));
    }
    const thumbnail = file(form,"thumbnail");
    if (thumbnail) results.push(await storeFile({ client,adminId:access.admin.id,resourceId:primaryId,role:"thumbnail",upload:thumbnail }));
    for (const preview of form.getAll("previews")) if (preview instanceof File && preview.size>0) {
      results.push(await storeFile({ client,adminId:access.admin.id,resourceId:primaryId,role:"preview_image",upload:preview }));
    }
    return safeRedirect(request,kind,results.some((result) => result.decision === "quarantined") ? "quarantined" : "saved");
  } catch {
    return safeRedirect(request,kind,"failed-closed");
  }
}
