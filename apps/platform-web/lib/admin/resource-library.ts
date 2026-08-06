import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminLessonOption = Readonly<{ id:string;label:string;gradeId:string;topicId:string;title:string }>;
export type AdminTopicOption = Readonly<{ id:string;label:string;gradeId:string;title:string;topicNumber:number }>;
export type AdminLibraryResource = Readonly<{
  id:string;title:string;description:string;resourceType:string;publicationState:string;versionNumber:number;lockVersion:number;
  slug:string;sortOrder:number;assignmentLockVersion:number;hierarchy:string;gradeId:string;topicId:string;lessonId:string;
  resourceScope:"topic"|"lesson";scopeStatus:"current"|"legacy";difficulty:string;minutes:number|null;tags:readonly string[];
  thumbnailPath:string|null;
  files:readonly Readonly<{id:string;role:string;filename:string;state:string;versionNumber:number}>[];
  history:readonly Readonly<{versionNumber:number;state:string;title:string}>[];
}>;
export type AdminResourceLibrarySnapshot = Readonly<{state:"ready"|"unavailable";lessons:readonly AdminLessonOption[];topics:readonly AdminTopicOption[];resources:readonly AdminLibraryResource[]}>;
export type AdminResourceDetail = Readonly<{kind:"homework"|"quizzes";resource:AdminLibraryResource}>;

export async function loadAdminResourceLibrary(kind:"homework"|"quizzes"):Promise<AdminResourceLibrarySnapshot>{
  const client=createServiceSupabaseClient();if(!client)return{state:"unavailable",lessons:[],topics:[],resources:[]};
  const[grades,topics,lessons,resources]=await Promise.all([
    client.from("content_grades").select("id,title,sort_order,grade_number").neq("publication_state","archived").order("sort_order"),
    client.from("content_topics").select("id,grade_id,title,sort_order").neq("publication_state","archived").order("sort_order"),
    client.from("content_lessons").select("id,topic_id,title,sort_order").neq("publication_state","archived").order("sort_order"),
    client.from("content_resources").select("id,resource_type,publication_state,current_version_number,published_version_number,lock_version,resource_scope,scope_status")
      .in("resource_type",kind==="homework"?["homework_pdf","homework_answer_key"]:["quiz_pdf","quiz_answer_key"]).order("updated_at",{ascending:false})
  ]);
  if([grades,topics,lessons,resources].some((result)=>result.error))return{state:"unavailable",lessons:[],topics:[],resources:[]};
  const gradeMap=new Map((grades.data??[]).map((grade)=>[grade.id,grade]));const topicMap=new Map((topics.data??[]).map((topic)=>[topic.id,topic]));const lessonMap=new Map((lessons.data??[]).map((lesson)=>[lesson.id,lesson]));
  const topicOptions=(topics.data??[]).map((topic)=>{const grade=gradeMap.get(topic.grade_id);return{id:topic.id,label:`${grade?.title??"Unknown grade"} / Topic ${topic.sort_order}: ${topic.title}`,gradeId:topic.grade_id,title:topic.title,topicNumber:topic.sort_order}});
  const lessonOptions=(lessons.data??[]).map((lesson)=>{const topic=topicMap.get(lesson.topic_id);const grade=topic?gradeMap.get(topic.grade_id):undefined;return{id:lesson.id,label:`${grade?.title??"Unknown grade"} / ${topic?.title??"Unknown topic"} / ${lesson.title}`,gradeId:grade?.id??"",topicId:topic?.id??"",title:lesson.title}});
  const resourceIds=(resources.data??[]).map((resource)=>resource.id);if(!resourceIds.length)return{state:"ready",lessons:lessonOptions,topics:topicOptions,resources:[]};
  const[lessonAssignments,topicAssignments,versions,files]=await Promise.all([
    client.from("lesson_resource_assignments").select("resource_id,lesson_id,slug,sort_order,lock_version").in("resource_id",resourceIds),
    client.from("topic_resource_assignments").select("resource_id,topic_id,slug,sort_order,lock_version").in("resource_id",resourceIds),
    client.from("content_resource_versions").select("id,resource_id,version_number,publication_state,title,description,thumbnail_path,tags,content_manifest,source_version_id").in("resource_id",resourceIds),
    client.from("resource_files").select("id,resource_id,resource_version_number,file_role,normalized_filename,validation_state").in("resource_id",resourceIds)
  ]);
  if([lessonAssignments,topicAssignments,versions,files].some((result)=>result.error))return{state:"unavailable",lessons:lessonOptions,topics:topicOptions,resources:[]};
  const lessonAssignmentMap=new Map((lessonAssignments.data??[]).map((assignment)=>[assignment.resource_id,assignment]));const topicAssignmentMap=new Map((topicAssignments.data??[]).map((assignment)=>[assignment.resource_id,assignment]));
  return{state:"ready",lessons:lessonOptions,topics:topicOptions,resources:(resources.data??[]).map((resource)=>{
    const version=(versions.data??[]).find((entry)=>entry.resource_id===resource.id&&entry.version_number===resource.current_version_number);
    const topicScoped=resource.resource_scope==="topic"&&resource.scope_status==="current";const topicAssignment=topicAssignmentMap.get(resource.id);const lessonAssignment=lessonAssignmentMap.get(resource.id);
    const lesson=lessonAssignment?lessonMap.get(lessonAssignment.lesson_id):undefined;const topic=topicScoped&&topicAssignment?topicMap.get(topicAssignment.topic_id):lesson?topicMap.get(lesson.topic_id):undefined;const grade=topic?gradeMap.get(topic.grade_id):undefined;
    const assignment=topicScoped?topicAssignment:lessonAssignment;const manifest=version?.content_manifest&&typeof version.content_manifest==="object"&&!Array.isArray(version.content_manifest)?version.content_manifest as Record<string,unknown>:{};
    const fileVersion=version?.source_version_id?(versions.data??[]).find((entry)=>entry.id===version.source_version_id)?.version_number??resource.current_version_number:resource.current_version_number;
    return{id:resource.id,title:version?.title??"Untitled resource",description:version?.description??"",resourceType:resource.resource_type,publicationState:resource.publication_state,versionNumber:resource.current_version_number,lockVersion:Number(resource.lock_version),
      slug:assignment?.slug??"",sortOrder:assignment?.sort_order??1,assignmentLockVersion:Number(assignment?.lock_version??0),hierarchy:topicScoped?`${grade?.title??"Unknown grade"} / Topic ${topic?.sort_order??"?"}: ${topic?.title??"Unknown topic"}`:`${grade?.title??"Unknown grade"} / ${topic?.title??"Unknown topic"} / ${lesson?.title??"Unknown lesson"}`,
      gradeId:grade?.id??"",topicId:topic?.id??"",lessonId:lesson?.id??"",resourceScope:topicScoped?"topic":"lesson",scopeStatus:resource.scope_status as "current"|"legacy",difficulty:typeof manifest.difficulty==="string"?manifest.difficulty:"core",minutes:typeof manifest.estimated_minutes==="number"?manifest.estimated_minutes:null,
      thumbnailPath:version?.thumbnail_path??null,tags:Array.isArray(version?.tags)?version.tags.filter((tag):tag is string=>typeof tag==="string"):[],files:(files.data??[]).filter((file)=>file.resource_id===resource.id&&file.resource_version_number===fileVersion).map((file)=>({id:file.id,role:file.file_role,filename:file.normalized_filename,state:file.validation_state,versionNumber:file.resource_version_number})),
      history:(versions.data??[]).filter((entry)=>entry.resource_id===resource.id).sort((a,b)=>b.version_number-a.version_number).map((entry)=>({versionNumber:entry.version_number,state:entry.publication_state,title:entry.title}))};
  })};
}

export async function loadAdminResourceDetail(resourceId:string):Promise<AdminResourceDetail|null>{
  if(!/^[0-9a-f-]{36}$/i.test(resourceId))return null;const client=createServiceSupabaseClient();if(!client)return null;
  const result=await client.from("content_resources").select("resource_type").eq("id",resourceId).maybeSingle();if(result.error||!result.data)return null;
  const kind:string=result.data.resource_type.startsWith("homework_")?"homework":result.data.resource_type.startsWith("quiz_")?"quizzes":"";if(!kind)return null;
  const snapshot=await loadAdminResourceLibrary(kind as "homework"|"quizzes");const resource=snapshot.resources.find((item)=>item.id===resourceId);return resource?{kind:kind as "homework"|"quizzes",resource}:null;
}
