import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminTaxonomyState = "draft" | "validating" | "ready_for_review" | "published" | "archived";
type Counts = Readonly<{ homework: number; quizzes: number; media: number }>;
export type AdminGradeTaxonomy = Readonly<{ id:string;gradeNumber:number;title:string;slug:string;sortOrder:number;state:AdminTaxonomyState;lockVersion:number;counts:Counts }>;
export type AdminTopicTaxonomy = Readonly<{ id:string;gradeId:string;title:string;slug:string;sortOrder:number;state:AdminTaxonomyState;lockVersion:number;gradeTitle:string;counts:Counts }>;
export type AdminLessonTaxonomy = Readonly<{ id:string;topicId:string;title:string;slug:string;sortOrder:number;state:AdminTaxonomyState;lockVersion:number;topicTitle:string;gradeTitle:string;counts:Counts }>;

export type AdminTaxonomySnapshot = Readonly<{
  state:"ready"|"unavailable";
  grades:readonly AdminGradeTaxonomy[];
  topics:readonly AdminTopicTaxonomy[];
  lessons:readonly AdminLessonTaxonomy[];
}>;

const zero = (): {homework:number;quizzes:number;media:number} => ({ homework:0, quizzes:0, media:0 });

export async function loadAdminTaxonomy():Promise<AdminTaxonomySnapshot>{
  const client=createServiceSupabaseClient();
  if(!client)return{state:"unavailable",grades:[],topics:[],lessons:[]};
  const[grades,topics,lessons,lessonAssignments,topicAssignments,resources,files]=await Promise.all([
    client.from("content_grades").select("id,grade_number,title,slug,sort_order,publication_state,lock_version").order("sort_order"),
    client.from("content_topics").select("id,grade_id,title,slug,sort_order,publication_state,lock_version").order("sort_order"),
    client.from("content_lessons").select("id,topic_id,title,slug,sort_order,publication_state,lock_version").order("sort_order"),
    client.from("lesson_resource_assignments").select("lesson_id,resource_id"),
    client.from("topic_resource_assignments").select("topic_id,resource_id"),
    client.from("content_resources").select("id,resource_type"),
    client.from("resource_files").select("resource_id")
  ]);
  if([grades,topics,lessons,lessonAssignments,topicAssignments,resources,files].some((result)=>result.error))return{state:"unavailable",grades:[],topics:[],lessons:[]};
  const gradeMap=new Map((grades.data??[]).map((grade)=>[grade.id,grade]));
  const topicMap=new Map((topics.data??[]).map((topic)=>[topic.id,topic]));
  const lessonCounts=new Map<string,{homework:number;quizzes:number;media:number}>();
  const topicCounts=new Map<string,{homework:number;quizzes:number;media:number}>();
  const gradeCounts=new Map<string,{homework:number;quizzes:number;media:number}>();
  const resourceMap=new Map((resources.data??[]).map((resource)=>[resource.id,resource.resource_type]));
  const mediaCounts=new Map<string,number>();
  for(const entry of files.data??[])mediaCounts.set(entry.resource_id,(mediaCounts.get(entry.resource_id)??0)+1);
  const add=(target:Map<string,{homework:number;quizzes:number;media:number}>,id:string,type:string,media:number)=>{const current=target.get(id)??zero();if(type.startsWith("homework_"))current.homework+=1;if(type.startsWith("quiz_"))current.quizzes+=1;current.media+=media;target.set(id,current)};
  for(const assignment of lessonAssignments.data??[]){const lesson=(lessons.data??[]).find((item)=>item.id===assignment.lesson_id);const topic=lesson?topicMap.get(lesson.topic_id):undefined;const type=resourceMap.get(assignment.resource_id)??"";const media=mediaCounts.get(assignment.resource_id)??0;add(lessonCounts,assignment.lesson_id,type,media);if(topic){add(topicCounts,topic.id,type,media);add(gradeCounts,topic.grade_id,type,media)}}
  for(const assignment of topicAssignments.data??[]){const topic=topicMap.get(assignment.topic_id);const type=resourceMap.get(assignment.resource_id)??"";const media=mediaCounts.get(assignment.resource_id)??0;add(topicCounts,assignment.topic_id,type,media);if(topic)add(gradeCounts,topic.grade_id,type,media)}
  return{state:"ready",
    grades:(grades.data??[]).map((grade)=>({id:grade.id,gradeNumber:grade.grade_number,title:grade.title,slug:grade.slug,sortOrder:grade.sort_order,state:grade.publication_state as AdminTaxonomyState,lockVersion:Number(grade.lock_version),counts:gradeCounts.get(grade.id)??zero()})),
    topics:(topics.data??[]).map((topic)=>({id:topic.id,gradeId:topic.grade_id,title:topic.title,slug:topic.slug,sortOrder:topic.sort_order,state:topic.publication_state as AdminTaxonomyState,lockVersion:Number(topic.lock_version),gradeTitle:gradeMap.get(topic.grade_id)?.title??"Unknown grade",counts:topicCounts.get(topic.id)??zero()})),
    lessons:(lessons.data??[]).map((lesson)=>{const topic=topicMap.get(lesson.topic_id);return{id:lesson.id,topicId:lesson.topic_id,title:lesson.title,slug:lesson.slug,sortOrder:lesson.sort_order,state:lesson.publication_state as AdminTaxonomyState,lockVersion:Number(lesson.lock_version),topicTitle:topic?.title??"Unknown topic",gradeTitle:topic?gradeMap.get(topic.grade_id)?.title??"Unknown grade":"Unknown grade",counts:lessonCounts.get(lesson.id)??zero()}})
  };
}
