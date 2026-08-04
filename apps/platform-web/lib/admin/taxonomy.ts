import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminTaxonomySnapshot = Readonly<{
  state: "ready" | "unavailable";
  grades: readonly Readonly<{ id: string; gradeNumber: number; title: string }>[];
  topics: readonly Readonly<{ id: string; gradeId: string; title: string; gradeTitle: string }>[];
  lessons: readonly Readonly<{ id: string; topicId: string; title: string; topicTitle: string; gradeTitle: string }>[];
}>;

export async function loadAdminTaxonomy(): Promise<AdminTaxonomySnapshot> {
  const client = createServiceSupabaseClient();
  if (!client) return { state: "unavailable", grades: [], topics: [], lessons: [] };
  const [grades, topics, lessons] = await Promise.all([
    client.from("content_grades").select("id,grade_number,title,sort_order").neq("publication_state", "archived").order("sort_order"),
    client.from("content_topics").select("id,grade_id,title,sort_order").neq("publication_state", "archived").order("sort_order"),
    client.from("content_lessons").select("id,topic_id,title,sort_order").neq("publication_state", "archived").order("sort_order")
  ]);
  if ([grades, topics, lessons].some((result) => result.error)) return { state: "unavailable", grades: [], topics: [], lessons: [] };
  const gradeMap = new Map((grades.data ?? []).map((grade) => [grade.id, grade]));
  const topicMap = new Map((topics.data ?? []).map((topic) => [topic.id, topic]));
  return {
    state: "ready",
    grades: (grades.data ?? []).map((grade) => ({ id: grade.id, gradeNumber: grade.grade_number, title: grade.title })),
    topics: (topics.data ?? []).map((topic) => ({ id: topic.id, gradeId: topic.grade_id, title: topic.title, gradeTitle: gradeMap.get(topic.grade_id)?.title ?? "Unknown grade" })),
    lessons: (lessons.data ?? []).map((lesson) => {
      const topic = topicMap.get(lesson.topic_id);
      return { id: lesson.id, topicId: lesson.topic_id, title: lesson.title, topicTitle: topic?.title ?? "Unknown topic", gradeTitle: topic ? gradeMap.get(topic.grade_id)?.title ?? "Unknown grade" : "Unknown grade" };
    })
  };
}
