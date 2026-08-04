import { normalizeContentTags, parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { storeResourceFile } from "@/lib/admin/resource-file-storage";
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
    const results = [await storeResourceFile({ client,adminId:access.admin.id,resourceId:primaryId,resourceVersion:1,role:"primary_pdf",upload:primary })];
    const answer = file(form,"answerPdf");
    if (answer) {
      const answerId = await createResource({ client,adminId:access.admin.id,lessonId,
        resourceType:kind === "homework" ? "homework_answer_key" : "quiz_answer_key",slug:`${slug}-answer-key`,sortOrder:sortOrder+1,
        title:`${title} answer key`,description:`Answer key for ${title}.`,tags,manifest:{ difficulty,estimated_minutes:minutes,asset_kind:"answer_key_pdf" } });
      results.push(await storeResourceFile({ client,adminId:access.admin.id,resourceId:answerId,resourceVersion:1,role:"answer_key_pdf",upload:answer }));
    }
    const thumbnail = file(form,"thumbnail");
    if (thumbnail) results.push(await storeResourceFile({ client,adminId:access.admin.id,resourceId:primaryId,resourceVersion:1,role:"thumbnail",upload:thumbnail }));
    for (const preview of form.getAll("previews")) if (preview instanceof File && preview.size>0) {
      results.push(await storeResourceFile({ client,adminId:access.admin.id,resourceId:primaryId,resourceVersion:1,role:"preview_image",upload:preview }));
    }
    return safeRedirect(request,kind,results.some((result) => result.decision === "quarantined") ? "quarantined" : "saved");
  } catch {
    return safeRedirect(request,kind,"failed-closed");
  }
}
