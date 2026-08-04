import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminLessonOption = Readonly<{ id: string; label: string }>;
export type AdminLibraryResource = Readonly<{
  id: string;
  title: string;
  description: string;
  resourceType: string;
  publicationState: string;
  versionNumber: number;
  lockVersion: number;
  slug: string;
  hierarchy: string;
  gradeId: string;
  topicId: string;
  lessonId: string;
  difficulty: string;
  minutes: number | null;
  tags: readonly string[];
  files: readonly Readonly<{ id: string; role: string; filename: string; state: string; versionNumber: number }>[];
  history: readonly Readonly<{ versionNumber: number; state: string; title: string }>[];
}>;
export type AdminResourceLibrarySnapshot = Readonly<{
  state: "ready" | "unavailable";
  lessons: readonly AdminLessonOption[];
  resources: readonly AdminLibraryResource[];
}>;

export async function loadAdminResourceLibrary(kind: "homework" | "quizzes"): Promise<AdminResourceLibrarySnapshot> {
  const client = createServiceSupabaseClient();
  if (!client) return { state: "unavailable", lessons: [], resources: [] };
  const [grades, topics, lessons, resources] = await Promise.all([
    client.from("content_grades").select("id,title,sort_order").neq("publication_state", "archived").order("sort_order"),
    client.from("content_topics").select("id,grade_id,title,sort_order").neq("publication_state", "archived").order("sort_order"),
    client.from("content_lessons").select("id,topic_id,title,sort_order").neq("publication_state", "archived").order("sort_order"),
    client.from("content_resources").select("id,resource_type,publication_state,current_version_number,published_version_number,lock_version")
      .in("resource_type", kind === "homework" ? ["homework_pdf", "homework_answer_key"] : ["quiz_pdf", "quiz_answer_key"])
      .order("updated_at", { ascending: false })
  ]);
  if ([grades, topics, lessons, resources].some((result) => result.error)) return { state: "unavailable", lessons: [], resources: [] };
  const gradeMap = new Map((grades.data ?? []).map((grade) => [grade.id, grade]));
  const topicMap = new Map((topics.data ?? []).map((topic) => [topic.id, topic]));
  const lessonOptions = (lessons.data ?? []).map((lesson) => {
    const topic = topicMap.get(lesson.topic_id); const grade = topic ? gradeMap.get(topic.grade_id) : undefined;
    return { id: lesson.id, label: `${grade?.title ?? "Unknown grade"} / ${topic?.title ?? "Unknown topic"} / ${lesson.title}` };
  });
  const resourceIds = (resources.data ?? []).map((resource) => resource.id);
  if (!resourceIds.length) return { state: "ready", lessons: lessonOptions, resources: [] };
  const [assignments, versions, files] = await Promise.all([
    client.from("lesson_resource_assignments").select("resource_id,lesson_id,slug").in("resource_id", resourceIds),
    client.from("content_resource_versions").select("id,resource_id,version_number,publication_state,title,description,tags,content_manifest,source_version_id").in("resource_id", resourceIds),
    client.from("resource_files").select("id,resource_id,resource_version_number,file_role,normalized_filename,validation_state").in("resource_id", resourceIds)
  ]);
  if ([assignments, versions, files].some((result) => result.error)) return { state: "unavailable", lessons: lessonOptions, resources: [] };
  const assignmentMap = new Map((assignments.data ?? []).map((assignment) => [assignment.resource_id, assignment]));
  const lessonMap = new Map((lessons.data ?? []).map((lesson) => [lesson.id, lesson]));
  return {
    state: "ready",
    lessons: lessonOptions,
    resources: (resources.data ?? []).map((resource) => {
      const version = (versions.data ?? []).find((entry) => entry.resource_id === resource.id && entry.version_number === resource.current_version_number);
      const assignment = assignmentMap.get(resource.id); const lesson = assignment ? lessonMap.get(assignment.lesson_id) : undefined;
      const topic = lesson ? topicMap.get(lesson.topic_id) : undefined; const grade = topic ? gradeMap.get(topic.grade_id) : undefined;
      const manifest = version?.content_manifest && typeof version.content_manifest === "object" && !Array.isArray(version.content_manifest) ? version.content_manifest as Record<string,unknown> : {};
      const fileVersion = version?.source_version_id ? (versions.data ?? []).find((entry) => entry.id === version.source_version_id)?.version_number ?? resource.current_version_number : resource.current_version_number;
      return {
        id: resource.id,
        title: version?.title ?? "Untitled resource",
        description: version?.description ?? "",
        resourceType: resource.resource_type,
        publicationState: resource.publication_state,
        versionNumber: resource.current_version_number,
        lockVersion: resource.lock_version,
        slug: assignment?.slug ?? "",
        hierarchy: `${grade?.title ?? "Unknown grade"} / ${topic?.title ?? "Unknown topic"} / ${lesson?.title ?? "Unknown lesson"}`,
        gradeId: grade?.id ?? "",
        topicId: topic?.id ?? "",
        lessonId: lesson?.id ?? "",
        difficulty: typeof manifest.difficulty === "string" ? manifest.difficulty : "core",
        minutes: typeof manifest.estimated_minutes === "number" ? manifest.estimated_minutes : null,
        tags: Array.isArray(version?.tags) ? version.tags.filter((tag): tag is string => typeof tag === "string") : [],
        files: (files.data ?? []).filter((file) => file.resource_id === resource.id && file.resource_version_number === fileVersion)
          .map((file) => ({ id: file.id, role: file.file_role, filename: file.normalized_filename, state: file.validation_state, versionNumber: file.resource_version_number })),
        history: (versions.data ?? []).filter((entry) => entry.resource_id === resource.id)
          .sort((a,b) => b.version_number-a.version_number)
          .map((entry) => ({ versionNumber: entry.version_number, state: entry.publication_state, title: entry.title }))
      };
    })
  };
}
