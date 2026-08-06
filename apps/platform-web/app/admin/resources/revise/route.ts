import { normalizeContentTags, parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function redirectBack(request: Request, resourceId: string, kind: string, result: string) {
  const target = new URL(`/admin/resources/${resourceId}`, process.env.MVH_APPLICATION_ORIGIN ?? request.url);
  target.searchParams.set("kind", kind === "quizzes" ? "quizzes" : "homework");
  target.searchParams.set("result", result);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const form = await request.formData();
  const resourceId = String(form.get("resourceId") ?? "");
  const kind = String(form.get("kind") ?? "");
  if (!await validateAdminMutationCsrf(form)) return redirectBack(request, resourceId, kind, "csrf-denied");
  const lockVersion = Number(form.get("lockVersion"));
  const assignmentLockVersion = Number(form.get("assignmentLockVersion"));
  const sortOrder = Number(form.get("sortOrder"));
  const minutes = Number(form.get("minutes"));
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const slug = parseContentSlug(String(form.get("slug") ?? ""));
  const tags = normalizeContentTags(String(form.get("tags") ?? "").split(",").filter(Boolean));
  const difficulty = String(form.get("difficulty") ?? "");
  const thumbnailPath = String(form.get("thumbnailPath") ?? "").trim() || null;
  if (!/^[0-9a-f-]{36}$/i.test(resourceId) || !["homework", "quizzes"].includes(kind) ||
      !Number.isSafeInteger(lockVersion) || !Number.isSafeInteger(assignmentLockVersion) ||
      !Number.isSafeInteger(sortOrder) || sortOrder < 1 || sortOrder > 32766 ||
      !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 240 || !slug || !tags ||
      !["core", "support", "challenge"].includes(difficulty) || title.length < 1 || title.length > 160 || description.length > 4000) {
    return redirectBack(request, resourceId, kind, "invalid-input");
  }
  const client = createServiceSupabaseClient();
  if (!client) return redirectBack(request, resourceId, kind, "failed-closed");
  const revised = await client.rpc("revise_scoped_content_resource", {
    p_actor_admin_id: access.admin.id, p_resource_id: resourceId, p_expected_lock_version: lockVersion,
    p_expected_assignment_lock_version: assignmentLockVersion, p_title: title, p_description: description,
    p_thumbnail_path: thumbnailPath, p_tags: tags, p_content_manifest: { difficulty, estimated_minutes: minutes },
    p_slug: slug, p_sort_order: sortOrder
  });
  return redirectBack(request, resourceId, kind, revised.error ? "failed-closed" : "revised");
}
