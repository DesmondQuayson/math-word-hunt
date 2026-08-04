import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { loadPublishedCmsDocument } from "@/lib/cms/public";
import { readMapPrepDestination, type MapPrepDestination } from "@math-vocabulary-hunt/platform-core";

export type PublicResource = Readonly<{
  id: string; title: string; description: string; resourceType: string; grade: string; topic: string; lesson: string;
  difficulty: string | null; minutes: number | null; tags: readonly string[]; previewFileIds: readonly string[]; downloadable: boolean;
}>;

export async function loadPublicResourceCatalog(kind: "homework"|"quizzes"): Promise<readonly PublicResource[]> {
  const client=createServiceSupabaseClient(); if(!client) return [];
  const types=kind==="homework" ? ["homework_pdf","homework_answer_key"] : ["quiz_pdf","quiz_answer_key"];
  const resources=await client.from("content_resources").select("id,resource_type,published_version_number").eq("publication_state","published").in("resource_type",types);
  if(resources.error || !resources.data?.length) return [];
  const ids=resources.data.map((resource)=>resource.id);
  const [versions,assignments,files]=await Promise.all([
    client.from("content_resource_versions").select("id,resource_id,version_number,title,description,tags,content_manifest,source_version_id").in("resource_id",ids).eq("publication_state","published"),
    client.from("lesson_resource_assignments").select("resource_id,lesson_id").in("resource_id",ids),
    client.from("resource_files").select("id,resource_id,resource_version_number,file_role").in("resource_id",ids).eq("validation_state","accepted")
  ]);
  if(versions.error||assignments.error||files.error) return [];
  const lessonIds=[...new Set((assignments.data??[]).map((item)=>item.lesson_id))];
  if(!lessonIds.length) return [];
  const lessons=await client.from("content_lessons").select("id,topic_id,title").in("id",lessonIds);
  const topicIds=[...new Set((lessons.data??[]).map((item)=>item.topic_id))];
  const topics=topicIds.length ? await client.from("content_topics").select("id,grade_id,title").in("id",topicIds) : {data:[],error:null};
  const gradeIds=[...new Set((topics.data??[]).map((item)=>item.grade_id))];
  const grades=gradeIds.length ? await client.from("content_grades").select("id,title,sort_order").in("id",gradeIds) : {data:[],error:null};
  if(lessons.error||topics.error||grades.error) return [];
  return resources.data.map((resource) => {
    const version=(versions.data??[]).find((item)=>item.resource_id===resource.id && item.version_number===resource.published_version_number);
    const assignment=(assignments.data??[]).find((item)=>item.resource_id===resource.id); const lesson=(lessons.data??[]).find((item)=>item.id===assignment?.lesson_id);
    const topic=(topics.data??[]).find((item)=>item.id===lesson?.topic_id); const grade=(grades.data??[]).find((item)=>item.id===topic?.grade_id);
    const manifest=(version?.content_manifest && typeof version.content_manifest==="object" && !Array.isArray(version.content_manifest)) ? version.content_manifest as Record<string,unknown> : {};
    const sourceVersion=version?.source_version_id?(versions.data??[]).find((item)=>item.id===version.source_version_id)?.version_number:null;const fileVersion=sourceVersion??resource.published_version_number;
    const resourceFiles=(files.data??[]).filter((item)=>item.resource_id===resource.id && item.resource_version_number===fileVersion);
    return { id:resource.id,title:version?.title??"Untitled resource",description:version?.description??"",resourceType:resource.resource_type,
      grade:grade?.title??"Unknown grade",topic:topic?.title??"Unknown topic",lesson:lesson?.title??"Unknown lesson",
      difficulty:typeof manifest.difficulty==="string"?manifest.difficulty:null,minutes:typeof manifest.estimated_minutes==="number"?manifest.estimated_minutes:null,
      tags:Array.isArray(version?.tags)?version.tags:[],previewFileIds:resourceFiles.filter((item)=>item.file_role==="preview_image"||item.file_role==="thumbnail").map((item)=>item.id),
      downloadable:resourceFiles.some((item)=>item.file_role==="primary_pdf"||item.file_role==="answer_key_pdf") };
  }).sort((a,b)=>`${a.grade}/${a.topic}/${a.lesson}/${a.title}`.localeCompare(`${b.grade}/${b.topic}/${b.lesson}/${b.title}`));
}

export async function loadMapPrepDestination(): Promise<MapPrepDestination|null> {
  const managed=await loadPublishedCmsDocument("map-prep");
  const block=managed?.content.blocks.find(item=>item.type==="external-link");
  const destination=readMapPrepDestination(block);
  return destination?.enabled ? destination : null;
}

export async function loadPublicResource(resourceId:string):Promise<PublicResource|null>{
  if(!/^[0-9a-f-]{36}$/i.test(resourceId)) return null;
  const [homework,quizzes]=await Promise.all([loadPublicResourceCatalog("homework"),loadPublicResourceCatalog("quizzes")]);
  return [...homework,...quizzes].find((resource)=>resource.id===resourceId)??null;
}
