import { parseContentSlug } from "@math-vocabulary-hunt/platform-core";
import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function back(request: Request, section: string, result: string) {
  const target = new URL("/admin", process.env.MVH_APPLICATION_ORIGIN ?? request.url);
  target.searchParams.set("section", ["homework", "quizzes"].includes(section) ? section : "homework");
  target.searchParams.set("taxonomy", result);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const form = await request.formData();
  const section = String(form.get("section") ?? "");
  if (!await validateAdminMutationCsrf(form)) return back(request, section, "csrf-denied");
  const kind = String(form.get("kind") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const slug = parseContentSlug(String(form.get("slug") ?? ""));
  const sortOrder = Number(form.get("sortOrder"));
  const parentId = String(form.get("parentId") ?? "");
  const gradeNumber = Number(form.get("gradeNumber"));
  if (!slug || title.length < 1 || title.length > 160 || !Number.isSafeInteger(sortOrder) || sortOrder < 1 || sortOrder > 32767 ||
      !["grade", "topic", "lesson"].includes(kind) || (kind !== "grade" && !/^[0-9a-f-]{36}$/i.test(parentId)) ||
      (kind === "grade" && (!Number.isSafeInteger(gradeNumber) || gradeNumber < 1 || gradeNumber > 9))) return back(request, section, "invalid-input");
  const client = createServiceSupabaseClient();
  if (!client) return back(request, section, "failed-closed");
  const response = kind === "grade"
    ? await client.rpc("create_content_grade", { p_actor_admin_id: access.admin.id, p_grade_number: gradeNumber, p_title: title, p_slug: slug, p_sort_order: sortOrder })
    : kind === "topic"
      ? await client.rpc("create_content_topic", { p_actor_admin_id: access.admin.id, p_grade_id: parentId, p_title: title, p_slug: slug, p_sort_order: sortOrder })
      : await client.rpc("create_content_lesson", { p_actor_admin_id: access.admin.id, p_topic_id: parentId, p_title: title, p_slug: slug, p_sort_order: sortOrder });
  return back(request, section, response.error ? "failed-closed" : "created");
}
