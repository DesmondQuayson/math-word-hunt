import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
export type AdminGameLesson=Readonly<{id:string;label:string;grade:number;topic:string;lesson:string}>;
export type AdminGamePackage=Readonly<{id:string;resourceId:string;gameId:string;packageVersion:string;resourceVersion:number;state:string;entryFile:string;title:string;description:string;hierarchy:string;lockVersion:number;assetCount:number;sourcePackageId:string|null}>;
export type AdminGamePackageSnapshot=Readonly<{state:"ready"|"unavailable";lessons:readonly AdminGameLesson[];packages:readonly AdminGamePackage[]}>;
export async function loadAdminGamePackages():Promise<AdminGamePackageSnapshot>{
  const client=createServiceSupabaseClient();if(!client)return{state:"unavailable",lessons:[],packages:[]};
  const [grades,topics,lessons,packages]=await Promise.all([
    client.from("content_grades").select("id,grade_number,title,sort_order").neq("publication_state","archived").order("sort_order"),
    client.from("content_topics").select("id,grade_id,title,sort_order").neq("publication_state","archived").order("sort_order"),
    client.from("content_lessons").select("id,topic_id,title,sort_order").neq("publication_state","archived").order("sort_order"),
    client.from("game_packages").select("id,resource_id,resource_version_number,game_id,package_version,publication_state,entry_file,source_package_id").order("created_at",{ascending:false})
  ]);if([grades,topics,lessons,packages].some(result=>result.error))return{state:"unavailable",lessons:[],packages:[]};
  const gradeMap=new Map((grades.data??[]).map(row=>[row.id,row]));const topicMap=new Map((topics.data??[]).map(row=>[row.id,row]));const lessonMap=new Map((lessons.data??[]).map(row=>[row.id,row]));
  const lessonOptions=(lessons.data??[]).map(lesson=>{const topic=topicMap.get(lesson.topic_id);const grade=topic?gradeMap.get(topic.grade_id):undefined;return{id:lesson.id,label:`${grade?.title??"Unknown grade"} / ${topic?.title??"Unknown topic"} / ${lesson.title}`,grade:grade?.grade_number??0,topic:topic?.title??"",lesson:lesson.title};});
  const resourceIds=[...new Set((packages.data??[]).map(row=>row.resource_id))];if(!resourceIds.length)return{state:"ready",lessons:lessonOptions,packages:[]};
  const [resources,versions,assignments,assets]=await Promise.all([
    client.from("content_resources").select("id,lock_version").in("id",resourceIds),
    client.from("content_resource_versions").select("resource_id,version_number,title,description").in("resource_id",resourceIds),
    client.from("lesson_resource_assignments").select("resource_id,lesson_id").in("resource_id",resourceIds),
    client.from("game_package_assets").select("package_id").in("package_id",(packages.data??[]).map(row=>row.id))
  ]);if([resources,versions,assignments,assets].some(result=>result.error))return{state:"unavailable",lessons:lessonOptions,packages:[]};
  return{state:"ready",lessons:lessonOptions,packages:(packages.data??[]).map(row=>{const version=(versions.data??[]).find(v=>v.resource_id===row.resource_id&&v.version_number===row.resource_version_number);const assignment=(assignments.data??[]).find(a=>a.resource_id===row.resource_id);const lesson=assignment?lessonMap.get(assignment.lesson_id):undefined;const topic=lesson?topicMap.get(lesson.topic_id):undefined;const grade=topic?gradeMap.get(topic.grade_id):undefined;return{id:row.id,resourceId:row.resource_id,gameId:row.game_id,packageVersion:row.package_version,resourceVersion:row.resource_version_number,state:row.publication_state,entryFile:row.entry_file,title:version?.title??row.game_id,description:version?.description??"",hierarchy:`${grade?.title??"Unknown grade"} / ${topic?.title??"Unknown topic"} / ${lesson?.title??"Unknown lesson"}`,lockVersion:(resources.data??[]).find(r=>r.id===row.resource_id)?.lock_version??0,assetCount:(assets.data??[]).filter(a=>a.package_id===row.id).length,sourcePackageId:row.source_package_id};})};
}
