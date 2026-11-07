import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

import { evaluateSystemHealth, type SystemHealthReport } from "./system-health";
import { loadSystemHealthEvidence, unavailableSystemHealthEvidence } from "./system-health-evidence";

export type AdminMetric=Readonly<{key:string;label:string;value:number|null;detail:string}>;
export type AdminAuditSummary=Readonly<{action:string;target:string|null;createdAt:string}>;
export type AdminDashboardSnapshot=Readonly<{
  state:"ready"|"unavailable";metrics:readonly AdminMetric[];health:SystemHealthReport;recentActions:readonly AdminAuditSummary[];
}>;

const unavailableMetrics:readonly AdminMetric[]=[
  ["games","Published Games"],["draft-games","Draft Games"],["homework","Homework PDFs"],["quizzes","Quiz PDFs"],["map-prep","Configured MAP Prep"],["taxonomy","Taxonomy completion"]
].map(([key,label])=>({key,label,value:null,detail:"Content service unavailable"}));

export async function loadAdminDashboard():Promise<AdminDashboardSnapshot>{
  const now=new Date();
  const client=createServiceSupabaseClient();if(!client)return{state:"unavailable",metrics:unavailableMetrics,health:evaluateSystemHealth(unavailableSystemHealthEvidence(now)),recentActions:[]};
  const[publishedGames,draftGames,homework,quizzes,mapPrep,publishedGrades,publishedTopics,publishedLessons,allGrades,allTopics,allLessons,actions]=await Promise.all([
    client.from("game_catalog_entries").select("id",{count:"exact",head:true}).eq("status","published"),
    client.from("game_catalog_entries").select("id",{count:"exact",head:true}).eq("status","draft"),
    client.from("content_resources").select("id",{count:"exact",head:true}).eq("resource_type","homework_pdf").eq("publication_state","published"),
    client.from("content_resources").select("id",{count:"exact",head:true}).eq("resource_type","quiz_pdf").eq("publication_state","published"),
    client.from("cms_documents").select("id",{count:"exact",head:true}).eq("document_key","map-prep").eq("publication_state","published"),
    client.from("content_grades").select("id",{count:"exact",head:true}).eq("publication_state","published"),client.from("content_topics").select("id",{count:"exact",head:true}).eq("publication_state","published"),client.from("content_lessons").select("id",{count:"exact",head:true}).eq("publication_state","published"),
    client.from("content_grades").select("id",{count:"exact",head:true}).neq("publication_state","archived"),client.from("content_topics").select("id",{count:"exact",head:true}).neq("publication_state","archived"),client.from("content_lessons").select("id",{count:"exact",head:true}).neq("publication_state","archived"),
    client.from("admin_audit_log").select("action,target,created_at").order("created_at",{ascending:false}).limit(6)
  ]);
  const core=[publishedGames,draftGames,homework,quizzes,mapPrep,publishedGrades,publishedTopics,publishedLessons,allGrades,allTopics,allLessons,actions];
  // Every content query failing means the database itself was unreachable;
  // a single failure is a content problem and leaves health evidence intact.
  const database=core.every((result)=>result.error)?"unavailable":"reachable";
  const health=evaluateSystemHealth(await loadSystemHealthEvidence(client,now,database));
  if(core.some((result)=>result.error))return{state:"unavailable",metrics:unavailableMetrics,health,recentActions:[]};
  const count=(value:Readonly<{count:number|null}>)=>value.count??0;const publishedTaxonomy=count(publishedGrades)+count(publishedTopics)+count(publishedLessons);const totalTaxonomy=count(allGrades)+count(allTopics)+count(allLessons);
  return{state:"ready",metrics:[
    {key:"games",label:"Published Games",value:count(publishedGames),detail:"Standalone catalog entries"},{key:"draft-games",label:"Draft Games",value:count(draftGames),detail:"Awaiting validation or publication"},{key:"homework",label:"Homework PDFs",value:count(homework),detail:"Published lesson-scoped resources"},{key:"quizzes",label:"Quiz PDFs",value:count(quizzes),detail:"Published topic-scoped resources"},{key:"map-prep",label:"Configured MAP Prep",value:count(mapPrep),detail:"Published configuration documents"},{key:"taxonomy",label:"Taxonomy completion",value:publishedTaxonomy,detail:`${publishedTaxonomy} of ${totalTaxonomy} active nodes published`}
  ],health,recentActions:(actions.data??[]).map((entry)=>({action:entry.action,target:entry.target,createdAt:entry.created_at}))};
}
