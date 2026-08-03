import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type PublicGame = Readonly<{ id:string; packageId:string; title:string; description:string; grade:string; topic:string; lesson:string; gameId:string; version:string }>;

export async function loadPublicGames(): Promise<readonly PublicGame[]> {
  const client=createServiceSupabaseClient(); if(!client)return [];
  const resources=await client.from("content_resources").select("id,published_version_number").eq("resource_type","game").eq("publication_state","published");
  if(resources.error||!resources.data?.length)return [];
  const ids=resources.data.map(row=>row.id);
  const [versions,packages,assignments]=await Promise.all([
    client.from("content_resource_versions").select("resource_id,version_number,title,description").in("resource_id",ids).eq("publication_state","published"),
    client.from("game_packages").select("id,resource_id,resource_version_number,game_id,package_version").in("resource_id",ids).eq("publication_state","published"),
    client.from("lesson_resource_assignments").select("resource_id,lesson_id").in("resource_id",ids)
  ]);if(versions.error||packages.error||assignments.error)return [];
  const lessonIds=[...new Set((assignments.data??[]).map(row=>row.lesson_id))];
  const lessons=lessonIds.length?await client.from("content_lessons").select("id,topic_id,title").in("id",lessonIds):{data:[],error:null};
  const topicIds=[...new Set((lessons.data??[]).map(row=>row.topic_id))];
  const topics=topicIds.length?await client.from("content_topics").select("id,grade_id,title").in("id",topicIds):{data:[],error:null};
  const gradeIds=[...new Set((topics.data??[]).map(row=>row.grade_id))];
  const grades=gradeIds.length?await client.from("content_grades").select("id,title").in("id",gradeIds):{data:[],error:null};
  if(lessons.error||topics.error||grades.error)return [];
  return resources.data.flatMap(resource=>{
    const packageRow=(packages.data??[]).find(row=>row.resource_id===resource.id&&row.resource_version_number===resource.published_version_number);
    const version=(versions.data??[]).find(row=>row.resource_id===resource.id&&row.version_number===resource.published_version_number);
    const assignment=(assignments.data??[]).find(row=>row.resource_id===resource.id);const lesson=(lessons.data??[]).find(row=>row.id===assignment?.lesson_id);const topic=(topics.data??[]).find(row=>row.id===lesson?.topic_id);const grade=(grades.data??[]).find(row=>row.id===topic?.grade_id);
    return packageRow&&version&&lesson&&topic&&grade?[{id:resource.id,packageId:packageRow.id,title:version.title,description:version.description,grade:grade.title,topic:topic.title,lesson:lesson.title,gameId:packageRow.game_id,version:packageRow.package_version}]:[];
  }).sort((a,b)=>`${a.grade}/${a.topic}/${a.lesson}/${a.title}`.localeCompare(`${b.grade}/${b.topic}/${b.lesson}/${b.title}`));
}

export async function loadPublicGame(resourceId:string):Promise<PublicGame|null>{if(!/^[0-9a-f-]{36}$/i.test(resourceId))return null;return(await loadPublicGames()).find(game=>game.id===resourceId)??null;}
