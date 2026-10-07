import "server-only";

import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import { EMAIL_WINDOW_DAYS, WEBHOOK_WINDOW_DAYS, evaluateSystemHealth, type SystemHealthEvidence, type SystemHealthReport } from "./system-health";

export type AdminMetric=Readonly<{key:string;label:string;value:number|null;detail:string}>;
export type AdminAuditSummary=Readonly<{action:string;target:string|null;createdAt:string}>;
export type AdminDashboardSnapshot=Readonly<{
  state:"ready"|"unavailable";metrics:readonly AdminMetric[];health:SystemHealthReport;recentActions:readonly AdminAuditSummary[];
}>;

type ServiceClient=NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
type Row=Record<string,unknown>;

const unavailableMetrics:readonly AdminMetric[]=[
  ["games","Published Games"],["draft-games","Draft Games"],["homework","Homework PDFs"],["quizzes","Quiz PDFs"],["map-prep","Configured MAP Prep"],["taxonomy","Taxonomy completion"]
].map(([key,label])=>({key,label,value:null,detail:"Content service unavailable"}));

const DAY=86_400_000;
const text=(value:unknown):string=>typeof value==="string"?value:"";
const nullableText=(value:unknown):string|null=>typeof value==="string"&&value?value:null;
const rows=(value:unknown):Row[]=>Array.isArray(value)?value as Row[]:[];

function unavailableEvidence(now:Date):SystemHealthEvidence{
  return{now,database:"unavailable",email:null,webhooks:null,reconciliation:null,storage:null,packages:null,pdfQuarantine:null,zipQuarantine:null};
}

async function loadEmailEvidence(client:ServiceClient,now:Date):Promise<SystemHealthEvidence["email"]>{
  // Three windows of history, so a failure can be matched to a later delivery
  // and "last confirmed" can be shown even when the window itself is quiet.
  const since=new Date(now.getTime()-3*EMAIL_WINDOW_DAYS*DAY).toISOString();
  const[signals,confirmations]=await Promise.all([
    client.from("platform_analytics_events").select("metric_key,outcome,occurred_at,quantity").like("metric_key","email-%").gte("occurred_at",since),
    client.from("consumer_accounts").select("created_at,email_confirmed_at").gte("email_confirmed_at",since)
  ]);
  if(signals.error||confirmations.error)return null;
  return{
    signals:rows(signals.data).map((row)=>({metricKey:text(row.metric_key),outcome:text(row.outcome),occurredAt:text(row.occurred_at),quantity:Number(row.quantity)||1})),
    confirmations:rows(confirmations.data).map((row)=>({createdAt:text(row.created_at),emailConfirmedAt:text(row.email_confirmed_at)}))
  };
}

async function loadWebhookEvidence(client:ServiceClient,now:Date):Promise<SystemHealthEvidence["webhooks"]>{
  const since=new Date(now.getTime()-WEBHOOK_WINDOW_DAYS*DAY).toISOString();
  const[total,recent,handled,open]=await Promise.all([
    client.from("billing_webhook_events").select("id",{count:"exact",head:true}),
    client.from("billing_webhook_events").select("processing_state,received_at,processed_at").gte("received_at",since),
    client.from("billing_webhook_events").select("received_at,processed_at").in("processing_state",["processed","ignored"]).order("received_at",{ascending:false}).limit(1),
    // `failed` is not a state the ledger can hold any more; it stays in the
    // filter so a legacy row could never hide. Retryable failures and stuck
    // receipts are included: the previous panel never counted them.
    client.from("billing_webhook_events").select("event_type,processing_state,failure_class,stripe_object_id,event_created_at,received_at,last_attempt_at").in("processing_state",["manual_review","retryable_failure","failed","received","processing"]).order("received_at",{ascending:true}).limit(200)
  ]);
  if(total.error||recent.error||handled.error||open.error)return null;
  const openRows=rows(open.data);
  const objectKeys=[...new Set(openRows.map((row)=>text(row.stripe_object_id)).filter(Boolean))];
  const subscriptionKeys=objectKeys.filter((key)=>key.startsWith("sub_"));
  const[processed,projections]=await Promise.all([
    objectKeys.length?client.from("billing_webhook_events").select("stripe_object_id,event_created_at").eq("processing_state","processed").in("stripe_object_id",objectKeys):Promise.resolve({data:[],error:null}),
    subscriptionKeys.length?client.from("billing_subscriptions").select("stripe_subscription_id,last_synchronized_at,latest_authoritative_event_created_at").in("stripe_subscription_id",subscriptionKeys):Promise.resolve({data:[],error:null})
  ]);
  if(processed.error||projections.error)return null;
  const latestHandled=rows(handled.data)[0];
  return{
    totalEvents:total.count??0,
    recent:rows(recent.data).map((row)=>({state:text(row.processing_state),receivedAt:text(row.received_at),processedAt:nullableText(row.processed_at)})),
    lastHandledAt:latestHandled?nullableText(latestHandled.processed_at)??nullableText(latestHandled.received_at):null,
    open:openRows.map((row)=>({eventType:text(row.event_type),state:text(row.processing_state),failureClass:nullableText(row.failure_class),objectKey:nullableText(row.stripe_object_id),eventCreatedAt:text(row.event_created_at),receivedAt:text(row.received_at),lastAttemptAt:nullableText(row.last_attempt_at)})),
    laterProcessed:rows(processed.data).map((row)=>({objectKey:text(row.stripe_object_id),at:text(row.event_created_at)})),
    projections:rows(projections.data).filter((row)=>row.last_synchronized_at).map((row)=>({objectKey:text(row.stripe_subscription_id),synchronizedAt:text(row.last_synchronized_at),authoritativeAt:text(row.latest_authoritative_event_created_at)}))
  };
}

async function loadHealthEvidence(client:ServiceClient,now:Date,database:SystemHealthEvidence["database"]):Promise<SystemHealthEvidence>{
  const[email,webhooks,subscriptions,buckets,packages,pdfQuarantine,zipQuarantine]=await Promise.all([
    loadEmailEvidence(client,now).catch(()=>null),
    loadWebhookEvidence(client,now).catch(()=>null),
    client.from("billing_subscriptions").select("subscription_status,last_synchronized_at,last_synchronization_source").not("owner_consumer_id","is",null),
    client.storage.listBuckets(),
    client.from("game_packages").select("publication_state"),
    client.from("resource_files").select("file_role,quarantined_at").eq("validation_state","quarantined"),
    client.from("game_package_quarantine_events").select("created_at")
  ]);
  return{
    now,database,email,webhooks,
    reconciliation:subscriptions.error?null:{expected:isProductionPlatformMode(),subscriptions:rows(subscriptions.data).map((row)=>({status:text(row.subscription_status),lastSynchronizedAt:nullableText(row.last_synchronized_at),source:nullableText(row.last_synchronization_source)}))},
    storage:buckets.error?null:{buckets:(buckets.data??[]).map((bucket)=>bucket.id)},
    packages:packages.error?null:{states:rows(packages.data).map((row)=>text(row.publication_state))},
    pdfQuarantine:pdfQuarantine.error?null:{files:rows(pdfQuarantine.data).map((row)=>({role:text(row.file_role),quarantinedAt:text(row.quarantined_at)}))},
    zipQuarantine:zipQuarantine.error?null:{events:rows(zipQuarantine.data).map((row)=>({createdAt:text(row.created_at)}))}
  };
}

export async function loadAdminDashboard():Promise<AdminDashboardSnapshot>{
  const now=new Date();
  const client=createServiceSupabaseClient();if(!client)return{state:"unavailable",metrics:unavailableMetrics,health:evaluateSystemHealth(unavailableEvidence(now)),recentActions:[]};
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
  const health=evaluateSystemHealth(database==="unavailable"?unavailableEvidence(now):await loadHealthEvidence(client,now,database));
  if(core.some((result)=>result.error))return{state:"unavailable",metrics:unavailableMetrics,health,recentActions:[]};
  const count=(value:Readonly<{count:number|null}>)=>value.count??0;const publishedTaxonomy=count(publishedGrades)+count(publishedTopics)+count(publishedLessons);const totalTaxonomy=count(allGrades)+count(allTopics)+count(allLessons);
  return{state:"ready",metrics:[
    {key:"games",label:"Published Games",value:count(publishedGames),detail:"Standalone catalog entries"},{key:"draft-games",label:"Draft Games",value:count(draftGames),detail:"Awaiting validation or publication"},{key:"homework",label:"Homework PDFs",value:count(homework),detail:"Published lesson-scoped resources"},{key:"quizzes",label:"Quiz PDFs",value:count(quizzes),detail:"Published topic-scoped resources"},{key:"map-prep",label:"Configured MAP Prep",value:count(mapPrep),detail:"Published configuration documents"},{key:"taxonomy",label:"Taxonomy completion",value:publishedTaxonomy,detail:`${publishedTaxonomy} of ${totalTaxonomy} active nodes published`}
  ],health,recentActions:(actions.data??[]).map((entry)=>({action:entry.action,target:entry.target,createdAt:entry.created_at}))};
}
