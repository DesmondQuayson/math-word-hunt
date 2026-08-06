import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminMetric=Readonly<{key:string;label:string;value:number|null;detail:string}>;
export type AdminAuditSummary=Readonly<{action:string;target:string|null;createdAt:string}>;
export type AdminDashboardSnapshot=Readonly<{
  state:"ready"|"unavailable";metrics:readonly AdminMetric[];
  emailHealth:"healthy"|"attention"|"no-events"|"unavailable";webhookHealth:"healthy"|"attention"|"no-events"|"unavailable";
  storageHealth:"healthy"|"attention"|"unavailable";packageHealth:"healthy"|"attention"|"no-packages"|"unavailable";
  pdfQuarantineCount:number|null;packageQuarantineCount:number|null;systemHealth:"operational"|"degraded";recentActions:readonly AdminAuditSummary[];
}>;

const unavailableMetrics:readonly AdminMetric[]=[
  ["games","Published Games"],["draft-games","Draft Games"],["homework","Homework PDFs"],["quizzes","Quiz PDFs"],["map-prep","Configured MAP Prep"],["taxonomy","Taxonomy completion"]
].map(([key,label])=>({key,label,value:null,detail:"Content service unavailable"}));

export async function loadAdminDashboard():Promise<AdminDashboardSnapshot>{
  const client=createServiceSupabaseClient();if(!client)return{state:"unavailable",metrics:unavailableMetrics,emailHealth:"unavailable",webhookHealth:"unavailable",storageHealth:"unavailable",packageHealth:"unavailable",pdfQuarantineCount:null,packageQuarantineCount:null,systemHealth:"degraded",recentActions:[]};
  const[publishedGames,draftGames,homework,quizzes,mapPrep,publishedGrades,publishedTopics,publishedLessons,allGrades,allTopics,allLessons,pdfQuarantine,packageQuarantine,packages,webhookFailures,webhookEvents,emailFailures,emailEvents,actions,buckets]=await Promise.all([
    client.from("game_catalog_entries").select("id",{count:"exact",head:true}).eq("status","published"),
    client.from("game_catalog_entries").select("id",{count:"exact",head:true}).eq("status","draft"),
    client.from("content_resources").select("id",{count:"exact",head:true}).eq("resource_type","homework_pdf").eq("publication_state","published"),
    client.from("content_resources").select("id",{count:"exact",head:true}).eq("resource_type","quiz_pdf").eq("publication_state","published"),
    client.from("cms_documents").select("id",{count:"exact",head:true}).eq("document_key","map-prep").eq("publication_state","published"),
    client.from("content_grades").select("id",{count:"exact",head:true}).eq("publication_state","published"),client.from("content_topics").select("id",{count:"exact",head:true}).eq("publication_state","published"),client.from("content_lessons").select("id",{count:"exact",head:true}).eq("publication_state","published"),
    client.from("content_grades").select("id",{count:"exact",head:true}).neq("publication_state","archived"),client.from("content_topics").select("id",{count:"exact",head:true}).neq("publication_state","archived"),client.from("content_lessons").select("id",{count:"exact",head:true}).neq("publication_state","archived"),
    client.from("resource_files").select("id",{count:"exact",head:true}).eq("validation_state","quarantined"),client.from("game_package_quarantine_events").select("id",{count:"exact",head:true}),client.from("game_packages").select("id,publication_state"),
    client.from("billing_webhook_events").select("id",{count:"exact",head:true}).in("processing_state",["failed","manual_review"]),client.from("billing_webhook_events").select("id",{count:"exact",head:true}),
    client.from("platform_analytics_events").select("id",{count:"exact",head:true}).in("metric_key",["email-confirmation-failure","email-recovery-failure"]),client.from("platform_analytics_events").select("id",{count:"exact",head:true}).in("metric_key",["email-confirmation-success","email-confirmation-failure","email-recovery-success","email-recovery-failure"]),
    client.from("admin_audit_log").select("action,target,created_at").order("created_at",{ascending:false}).limit(6),client.storage.listBuckets()
  ]);
  const core=[publishedGames,draftGames,homework,quizzes,mapPrep,publishedGrades,publishedTopics,publishedLessons,allGrades,allTopics,allLessons,pdfQuarantine,packageQuarantine,packages,webhookFailures,webhookEvents,emailFailures,emailEvents,actions];
  if(core.some((result)=>result.error))return{state:"unavailable",metrics:unavailableMetrics,emailHealth:"unavailable",webhookHealth:"unavailable",storageHealth:"unavailable",packageHealth:"unavailable",pdfQuarantineCount:null,packageQuarantineCount:null,systemHealth:"degraded",recentActions:[]};
  const count=(value:Readonly<{count:number|null}>)=>value.count??0;const publishedTaxonomy=count(publishedGrades)+count(publishedTopics)+count(publishedLessons);const totalTaxonomy=count(allGrades)+count(allTopics)+count(allLessons);const requiredBuckets=["resource-files","resource-quarantine","game-packages","game-package-quarantine"];
  const storageHealth=buckets.error?"unavailable":requiredBuckets.every((required)=>(buckets.data??[]).some((bucket)=>bucket.id===required))?"healthy":"attention";
  const packageRows=packages.data??[];const packageHealth=packageRows.length===0?"no-packages":packageRows.some((item)=>item.publication_state==="validating")?"attention":"healthy";const webhookCount=count(webhookEvents),failureCount=count(webhookFailures),emailCount=count(emailEvents),emailFailureCount=count(emailFailures);
  return{state:"ready",metrics:[
    {key:"games",label:"Published Games",value:count(publishedGames),detail:"Standalone catalog entries"},{key:"draft-games",label:"Draft Games",value:count(draftGames),detail:"Awaiting validation or publication"},{key:"homework",label:"Homework PDFs",value:count(homework),detail:"Published lesson-scoped resources"},{key:"quizzes",label:"Quiz PDFs",value:count(quizzes),detail:"Published topic-scoped resources"},{key:"map-prep",label:"Configured MAP Prep",value:count(mapPrep),detail:"Published configuration documents"},{key:"taxonomy",label:"Taxonomy completion",value:publishedTaxonomy,detail:`${publishedTaxonomy} of ${totalTaxonomy} active nodes published`}
  ],emailHealth:emailCount===0?"no-events":emailFailureCount>0?"attention":"healthy",webhookHealth:webhookCount===0?"no-events":failureCount>0?"attention":"healthy",storageHealth,packageHealth,pdfQuarantineCount:count(pdfQuarantine),packageQuarantineCount:count(packageQuarantine),systemHealth:storageHealth==="healthy"&&failureCount===0?"operational":"degraded",recentActions:(actions.data??[]).map((entry)=>({action:entry.action,target:entry.target,createdAt:entry.created_at}))};
}
