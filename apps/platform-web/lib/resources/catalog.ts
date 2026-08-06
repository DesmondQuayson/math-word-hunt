import "server-only";

import { readMapPrepDestination, type MapPrepDestination } from "@math-vocabulary-hunt/platform-core";

import { loadPublishedCmsDocument } from "@/lib/cms/public";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type PublicTaxonomy = Readonly<{
  grades: readonly Readonly<{ id: string; title: string; sortOrder: number }>[];
  topics: readonly Readonly<{ id: string; gradeId: string; title: string; sortOrder: number }>[];
  lessons: readonly Readonly<{ id: string; topicId: string; title: string; sortOrder: number }>[];
}>;

export type PublicResource = Readonly<{
  id: string;
  title: string;
  description: string;
  resourceType: string;
  gradeId: string;
  topicId: string;
  lessonId: string | null;
  grade: string;
  topic: string;
  topicNumber: number;
  lesson: string | null;
  difficulty: string | null;
  minutes: number | null;
  tags: readonly string[];
  previewFileIds: readonly string[];
  downloadable: boolean;
  isAnswerKey: boolean;
  answerKeyResourceId: string | null;
}>;

export type PublicResourceLibraryData = Readonly<{ taxonomy: PublicTaxonomy; resources: readonly PublicResource[] }>;

async function loadTaxonomy(): Promise<PublicTaxonomy> {
  const client = createServiceSupabaseClient();
  if (!client) return { grades: [], topics: [], lessons: [] };
  const [grades, topics, lessons] = await Promise.all([
    client.from("content_grades").select("id,title,sort_order").eq("publication_state", "published").order("sort_order"),
    client.from("content_topics").select("id,grade_id,title,sort_order").eq("publication_state", "published").order("sort_order"),
    client.from("content_lessons").select("id,topic_id,title,sort_order").eq("publication_state", "published").order("sort_order")
  ]);
  if (grades.error || topics.error || lessons.error) return { grades: [], topics: [], lessons: [] };
  return {
    grades: (grades.data ?? []).map((item) => ({ id: item.id, title: item.title, sortOrder: item.sort_order })),
    topics: (topics.data ?? []).map((item) => ({ id: item.id, gradeId: item.grade_id, title: item.title, sortOrder: item.sort_order })),
    lessons: (lessons.data ?? []).map((item) => ({ id: item.id, topicId: item.topic_id, title: item.title, sortOrder: item.sort_order }))
  };
}

export async function loadPublicResourceLibrary(kind: "homework" | "quizzes"): Promise<PublicResourceLibraryData> {
  const client = createServiceSupabaseClient();
  const taxonomy = await loadTaxonomy();
  if (!client) return { taxonomy, resources: [] };
  const types = kind === "homework" ? ["homework_pdf", "homework_answer_key"] : ["quiz_pdf", "quiz_answer_key"];
  const resources = await client.from("content_resources")
    .select("id,resource_type,published_version_number,resource_scope,scope_status")
    .eq("publication_state", "published")
    .eq("resource_scope", kind === "homework" ? "lesson" : "topic")
    .eq("scope_status", "current")
    .in("resource_type", types);
  if (resources.error || !resources.data?.length) return { taxonomy, resources: [] };
  const ids = resources.data.map((resource) => resource.id);
  const assignmentQuery = kind === "homework"
    ? client.from("lesson_resource_assignments").select("resource_id,lesson_id,slug").in("resource_id", ids)
    : client.from("topic_resource_assignments").select("resource_id,topic_id,slug").in("resource_id", ids);
  const [versions, assignments, files] = await Promise.all([
    client.from("content_resource_versions").select("id,resource_id,version_number,title,description,tags,content_manifest,source_version_id").in("resource_id", ids).eq("publication_state", "published"),
    assignmentQuery,
    client.from("resource_files").select("id,resource_id,resource_version_number,file_role").in("resource_id", ids).eq("validation_state", "accepted")
  ]);
  if (versions.error || assignments.error || files.error) return { taxonomy, resources: [] };
  const assignmentRows = assignments.data ?? [];
  const result = resources.data.flatMap((resource): PublicResource[] => {
    const version = (versions.data ?? []).find((item) => item.resource_id === resource.id && item.version_number === resource.published_version_number);
    const assignment = assignmentRows.find((item) => item.resource_id === resource.id);
    const lessonId = kind === "homework" && assignment && "lesson_id" in assignment ? assignment.lesson_id : null;
    const lesson = taxonomy.lessons.find((item) => item.id === lessonId);
    const topicId = kind === "quizzes" && assignment && "topic_id" in assignment ? assignment.topic_id : lesson?.topicId;
    const topic = taxonomy.topics.find((item) => item.id === topicId);
    const grade = taxonomy.grades.find((item) => item.id === topic?.gradeId);
    if (!version || !assignment || !topic || !grade || (kind === "homework" && !lesson)) return [];
    const manifest = version.content_manifest && typeof version.content_manifest === "object" && !Array.isArray(version.content_manifest)
      ? version.content_manifest as Record<string, unknown> : {};
    const sourceVersion = version.source_version_id ? (versions.data ?? []).find((item) => item.id === version.source_version_id)?.version_number : null;
    const fileVersion = sourceVersion ?? resource.published_version_number;
    const resourceFiles = (files.data ?? []).filter((item) => item.resource_id === resource.id && item.resource_version_number === fileVersion);
    const isAnswerKey = resource.resource_type.includes("answer_key");
    const baseSlug = assignment.slug.replace(/-answer-key$/, "");
    const answerAssignment = assignmentRows.find((item) => item.slug === `${baseSlug}-answer-key` && item.resource_id !== resource.id);
    const answerResource = resources.data.find((item) => item.id === answerAssignment?.resource_id && item.resource_type.includes("answer_key"));
    return [{
      id: resource.id,
      title: version.title,
      description: version.description,
      resourceType: resource.resource_type,
      gradeId: grade.id,
      topicId: topic.id,
      lessonId: lesson?.id ?? null,
      grade: grade.title,
      topic: topic.title,
      topicNumber: topic.sortOrder,
      lesson: lesson?.title ?? null,
      difficulty: typeof manifest.difficulty === "string" ? manifest.difficulty : null,
      minutes: typeof manifest.estimated_minutes === "number" ? manifest.estimated_minutes : null,
      tags: Array.isArray(version.tags) ? version.tags : [],
      previewFileIds: resourceFiles.filter((item) => item.file_role === "preview_image" || item.file_role === "thumbnail").map((item) => item.id),
      downloadable: resourceFiles.some((item) => item.file_role === (isAnswerKey ? "answer_key_pdf" : "primary_pdf")),
      isAnswerKey,
      answerKeyResourceId: isAnswerKey ? null : answerResource?.id ?? null
    }];
  });
  return {
    taxonomy,
    resources: result.sort((a, b) => `${a.grade}/${a.topicNumber}/${a.lesson ?? ""}/${a.title}`.localeCompare(`${b.grade}/${b.topicNumber}/${b.lesson ?? ""}/${b.title}`))
  };
}

export async function loadPublicResourceCatalog(kind: "homework" | "quizzes"): Promise<readonly PublicResource[]> {
  return (await loadPublicResourceLibrary(kind)).resources;
}

export async function loadMapPrepDestination(): Promise<MapPrepDestination | null> {
  const managed = await loadPublishedCmsDocument("map-prep");
  const block = managed?.content.blocks.find((item) => item.type === "external-link");
  const destination = readMapPrepDestination(block);
  return destination?.enabled ? destination : null;
}

export async function loadPublicResource(resourceId: string): Promise<PublicResource | null> {
  if (!/^[0-9a-f-]{36}$/i.test(resourceId)) return null;
  const [homework, quizzes] = await Promise.all([loadPublicResourceCatalog("homework"), loadPublicResourceCatalog("quizzes")]);
  return [...homework, ...quizzes].find((resource) => resource.id === resourceId) ?? null;
}
