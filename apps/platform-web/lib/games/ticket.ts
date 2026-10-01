import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { decideMathNexaAccess, hasMathNexaModuleAccess } from "@math-vocabulary-hunt/platform-core";

import type { ConsumerAccountRecord } from "@/lib/auth/consumer-context";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { getGameAccessView, type AccessPrincipal } from "@/lib/game-access/server";
import { SupabaseConsumerEntitlementRepository } from "@/lib/repositories/consumer-entitlement.repository";
import { getSchoolAccessConfiguration } from "@/lib/school-access/config";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

// Package games run in an <iframe sandbox="allow-scripts"> (an opaque origin). Chromium sends no SameSite=Lax
// cookie on that frame's sub-resource requests, so a package's CSS and JS authenticate with this signed,
// 300-second ticket instead. Every asset still re-decides, on the server, whether the ticket principal may
// play: see authorizeSubscriberGameAsset.
type TicketAudience="admin-preview"|"subscriber";
type TicketPrincipalKind="admin"|AccessPrincipal["kind"];
type TicketPayload=Readonly<{v:1;aud:TicketAudience;packageId:string;principalId:string;issuedAt:number;expiresAt:number}>;
export type VerifiedGameAssetTicket=TicketPayload&Readonly<{principalKind:TicketPrincipalKind}>;
type TicketInput=Readonly<{audience:"admin-preview";packageId:string;principalId:string;now?:Date}>|Readonly<{audience:"subscriber";principalKind:AccessPrincipal["kind"];sessionEndsAt?:string|null;packageId:string;principalId:string;now?:Date}>;

function secret():string|null{const value=process.env.MVH_GAME_DELIVERY_SECRET?.trim()??"";return /^[\x21-\x7e]{32,256}$/.test(value)?value:null;}
function signature(value:string,key:string):Buffer{return createHmac("sha256",key).update(value).digest();}
// School-access sessions are stateless signed cookies with no server record (lib/school-access/session.ts).
// Their tickets are signed with a key derived from the delivery secret AND the current school session secret:
// the principal kind is proven by which key verifies, and removing school access or rotating its secret
// revokes in-flight tickets exactly as it revokes the cookie.
function schoolAccessKey(key:string):string|null{const configuration=getSchoolAccessConfiguration();return configuration?createHmac("sha256",key).update(`mathnexa-game-ticket:school-access:v1:${configuration.sessionSecret}`).digest("base64url"):null;}
function ticketKey(key:string,kind:TicketPrincipalKind):string|null{return kind==="school-access"?schoolAccessKey(key):key;}
function signedWith(encoded:string,supplied:Buffer,key:string|null):boolean{if(!key)return false;const expected=signature(encoded,key);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}

export function createGameAssetTicket(input:TicketInput):string|null{
  const delivery=secret(),now=input.now??new Date(),kind:TicketPrincipalKind=input.audience==="admin-preview"?"admin":input.principalKind,key=delivery?ticketKey(delivery,kind):null;if(!key||!Number.isFinite(now.getTime())||!/^[0-9a-f-]{36}$/i.test(input.packageId)||!/^[0-9a-f-]{36}$/i.test(input.principalId))return null;
  const issuedAt=Math.floor(now.getTime()/1000),payload:TicketPayload={v:1,aud:input.audience,packageId:input.packageId,principalId:input.principalId,issuedAt,expiresAt:issuedAt+300};
  // A school session cannot be re-checked once it ends, so its ticket may never outlive it.
  if(input.audience==="subscriber"&&input.principalKind==="school-access"&&!(Date.parse(input.sessionEndsAt??"")>=payload.expiresAt*1000))return null;
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");return `${encoded}.${signature(encoded,key).toString("base64url")}`;
}

export function verifyGameAssetTicket(value:string,audience:TicketAudience,packageId:string,now=new Date()):VerifiedGameAssetTicket|null{
  const key=secret(),parts=value.split(".");if(!key||parts.length!==2||value.length>700||!Number.isFinite(now.getTime()))return null;
  let supplied:Buffer,payload:unknown;try{supplied=Buffer.from(parts[1]!,"base64url");payload=JSON.parse(Buffer.from(parts[0]!,"base64url").toString("utf8"))}catch{return null}
  const principalKind:TicketPrincipalKind|null=supplied.toString("base64url")!==parts[1]?null:audience==="admin-preview"?(signedWith(parts[0]!,supplied,key)?"admin":null):signedWith(parts[0]!,supplied,key)?"consumer":signedWith(parts[0]!,supplied,schoolAccessKey(key))?"school-access":null;if(!principalKind||!payload||typeof payload!=="object"||Array.isArray(payload))return null;
  const item=payload as Record<string,unknown>,keys=Object.keys(item).sort().join("|");if(keys!=="aud|expiresAt|issuedAt|packageId|principalId|v"||item.v!==1||item.aud!==audience||item.packageId!==packageId||typeof item.principalId!=="string"||!/^[0-9a-f-]{36}$/i.test(item.principalId)||!Number.isSafeInteger(item.issuedAt)||!Number.isSafeInteger(item.expiresAt))return null;
  const current=Math.floor(now.getTime()/1000);if((item.issuedAt as number)>current+5||(item.expiresAt as number)<=current||(item.expiresAt as number)-(item.issuedAt as number)!==300)return null;return Object.freeze({...(item as TicketPayload),principalKind});
}

// The ticket principal's consumer_accounts row, selected and mapped exactly as resolveConsumerContext()
// (lib/auth/consumer-context.ts) maps the signed-in user's row; ticket.test.ts pins the two together.
export const TICKET_ACCOUNT_COLUMNS="user_id, account_status, email_confirmed_at, trial_redeemed_at, deletion_requested_at, deletion_completed_at, created_at, updated_at";
function text(value:unknown):string|null{return typeof value==="string"&&value.length>0&&Number.isFinite(Date.parse(value))?value:null;}
export function ticketAccountRecord(data:Readonly<Record<string,unknown>>|null|undefined):ConsumerAccountRecord|null{
  const status=data?.account_status;if(!data||typeof data.user_id!=="string"||(status!=="active"&&status!=="suspended"&&status!=="deletion_pending"))return null;
  return Object.freeze({userId:data.user_id,accountStatus:status==="deletion_pending"?"deletion-pending":status,emailConfirmedAt:text(data.email_confirmed_at),trialRedeemedAt:text(data.trial_redeemed_at),deletionRequestedAt:text(data.deletion_requested_at),deletionCompletedAt:text(data.deletion_completed_at),createdAt:text(data.created_at)??String(data.created_at),updatedAt:text(data.updated_at)??String(data.updated_at)});
}

async function ticketConsumerHasGames(userId:string,now:Date):Promise<boolean>{
  if(!isProductionPlatformMode())return false;const client=createServiceSupabaseClient();if(!client)return false;
  const row=await client.from("consumer_accounts").select(TICKET_ACCOUNT_COLUMNS).eq("user_id",userId).maybeSingle(),account=row.error?null:ticketAccountRecord(row.data as Readonly<Record<string,unknown>>|null);if(!account||account.userId!==userId)return false;
  const evidence=await new SupabaseConsumerEntitlementRepository(client).getEvidence(account);
  return hasMathNexaModuleAccess(decideMathNexaAccess({authenticated:true,accountStatus:account.accountStatus,emailConfirmed:account.emailConfirmedAt!==null,evidence,serverNow:now}),"games");
}

export async function authorizeSubscriberGameAsset(ticket:string,packageId:string,now=new Date()):Promise<boolean>{
  const payload=verifyGameAssetTicket(ticket,"subscriber",packageId,now);if(!payload)return false;
  const access=await getGameAccessView(now);
  // A request that carries a session (WebKit sub-resources; every frame navigation) must BE the ticket principal. A mismatch is final.
  if(access.principal)return access.principal.kind===payload.principalKind&&access.principal.id===payload.principalId&&hasMathNexaModuleAccess(access.decision,"games");
  // No session (Chromium sub-resources of the opaque-origin sandboxed frame): the signed ticket names the principal and the server re-decides its access now.
  return payload.principalKind==="consumer"?ticketConsumerHasGames(payload.principalId,now):payload.principalKind==="school-access"&&getSchoolAccessConfiguration()!==null;
}
