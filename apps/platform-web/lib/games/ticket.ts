import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { hasMathNexaModuleAccess } from "@math-vocabulary-hunt/platform-core";

import { getGameAccessView } from "@/lib/game-access/server";

type TicketAudience="admin-preview"|"subscriber";
type TicketPayload=Readonly<{v:1;aud:TicketAudience;packageId:string;principalId:string;issuedAt:number;expiresAt:number}>;

function secret():string|null{const value=process.env.MVH_GAME_DELIVERY_SECRET?.trim()??"";return /^[\x21-\x7e]{32,256}$/.test(value)?value:null;}
function signature(value:string,key:string):Buffer{return createHmac("sha256",key).update(value).digest();}

export function createGameAssetTicket(input:Readonly<{audience:TicketAudience;packageId:string;principalId:string;now?:Date}>):string|null{
  const key=secret(),now=input.now??new Date();if(!key||!Number.isFinite(now.getTime())||!/^[0-9a-f-]{36}$/i.test(input.packageId)||!/^[0-9a-f-]{36}$/i.test(input.principalId))return null;
  const issuedAt=Math.floor(now.getTime()/1000),payload:TicketPayload={v:1,aud:input.audience,packageId:input.packageId,principalId:input.principalId,issuedAt,expiresAt:issuedAt+300};
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");return `${encoded}.${signature(encoded,key).toString("base64url")}`;
}

export function verifyGameAssetTicket(value:string,audience:TicketAudience,packageId:string,now=new Date()):TicketPayload|null{
  const key=secret(),parts=value.split(".");if(!key||parts.length!==2||value.length>700||!Number.isFinite(now.getTime()))return null;
  let supplied:Buffer,payload:unknown;try{supplied=Buffer.from(parts[1]!,"base64url");payload=JSON.parse(Buffer.from(parts[0]!,"base64url").toString("utf8"))}catch{return null}const expected=signature(parts[0]!,key);if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)||!payload||typeof payload!=="object"||Array.isArray(payload))return null;
  const item=payload as Record<string,unknown>,keys=Object.keys(item).sort().join("|");if(keys!=="aud|expiresAt|issuedAt|packageId|principalId|v"||item.v!==1||item.aud!==audience||item.packageId!==packageId||typeof item.principalId!=="string"||!/^[0-9a-f-]{36}$/i.test(item.principalId)||!Number.isSafeInteger(item.issuedAt)||!Number.isSafeInteger(item.expiresAt))return null;
  const current=Math.floor(now.getTime()/1000);if((item.issuedAt as number)>current+5||(item.expiresAt as number)<=current||(item.expiresAt as number)-(item.issuedAt as number)!==300)return null;return item as TicketPayload;
}

export async function authorizeSubscriberGameAsset(ticket:string,packageId:string,now=new Date()):Promise<boolean>{
  const payload=verifyGameAssetTicket(ticket,"subscriber",packageId,now);if(!payload)return false;
  const access=await getGameAccessView(now);return access.principal?.id===payload.principalId&&hasMathNexaModuleAccess(access.decision,"games");
}
