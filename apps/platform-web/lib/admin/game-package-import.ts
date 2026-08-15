import "server-only";

import { inspectGamePackage, inspectZipCentralDirectory, type GamePackageManifest } from "@math-vocabulary-hunt/platform-core";
import { unzipSync } from "fflate";

export type ExtractedGameAsset = Readonly<{ path: string; bytes: Uint8Array; mimeType: string }>;
export type GameArchiveResult = Readonly<{
  decision: "accepted" | "quarantined";
  manifest: GamePackageManifest | null;
  metadata: Readonly<Record<string,unknown>> | null;
  assets: readonly ExtractedGameAsset[];
  expandedSize: number;
  findings: readonly string[];
}>;

const MIME_BY_EXTENSION: Readonly<Record<string,string>> = Object.freeze({
  html:"text/html",css:"text/css",js:"text/javascript",mjs:"text/javascript",json:"application/json",
  png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",
  mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",m4a:"audio/mp4",woff:"font/woff",woff2:"font/woff2"
});

export function normalizeGamePackageFilename(value: unknown): string | null {
  if(typeof value!=="string"||!/\.zip$/i.test(value))return null;
  const base=value.replaceAll("\\","/").split("/").at(-1)?.normalize("NFKC").replace(/\.zip$/i,"")??"";
  const stem=base.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96);
  return stem?`${stem}.zip`:null;
}

function parseJson(bytes: Uint8Array): unknown {
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  if(text.length>65_536)throw new Error("json-size-limit");
  return JSON.parse(text) as unknown;
}

export async function inspectGameArchive(archive: Uint8Array): Promise<GameArchiveResult> {
  const preflight=inspectZipCentralDirectory(archive);
  if(preflight.decision==="quarantined")return {decision:"quarantined",manifest:null,metadata:null,assets:[],expandedSize:preflight.expandedSize,findings:preflight.findings};
  const expected=new Map(preflight.entries.map((entry)=>[entry.path,entry.expandedSize]));
  let extracted:Record<string,Uint8Array>;
  try {
    extracted=unzipSync(archive,{filter:(entry)=>!entry.name.endsWith("/")&&expected.has(entry.name)&&entry.originalSize===expected.get(entry.name)});
  } catch { return {decision:"quarantined",manifest:null,metadata:null,assets:[],expandedSize:preflight.expandedSize,findings:["decompression-failed"]}; }
  const paths=Object.keys(extracted);
  if(paths.length!==preflight.entries.length||paths.some((path)=>extracted[path]!.byteLength!==expected.get(path)))return {decision:"quarantined",manifest:null,metadata:null,assets:[],expandedSize:preflight.expandedSize,findings:["central-local-entry-mismatch"]};
  let manifestJson:unknown,metadataJson:unknown;
  try {if(!extracted["manifest.json"]||!extracted["metadata.json"])throw new Error("required-json-missing");manifestJson=parseJson(extracted["manifest.json"]);metadataJson=parseJson(extracted["metadata.json"]);} catch {return {decision:"quarantined",manifest:null,metadata:null,assets:[],expandedSize:preflight.expandedSize,findings:["invalid-package-json"]};}
  const packageInspection=await inspectGamePackage({manifestJson,metadataJson,assets:paths.filter((path)=>path!=="manifest.json").map((path)=>({path,bytes:extracted[path]!}))});
  if(packageInspection.decision==="quarantined"||!packageInspection.manifest)return {decision:"quarantined",manifest:packageInspection.manifest,metadata:packageInspection.metadata,assets:[],expandedSize:preflight.expandedSize,findings:packageInspection.findings};
  const exact=new Set(["manifest.json",...packageInspection.manifest.assetInventory]);
  if(paths.length!==exact.size||paths.some((path)=>!exact.has(path)))return {decision:"quarantined",manifest:packageInspection.manifest,metadata:packageInspection.metadata,assets:[],expandedSize:preflight.expandedSize,findings:["undeclared-package-entry"]};
  const assets=packageInspection.manifest.assetInventory.map((path)=>({path,bytes:extracted[path]!,mimeType:MIME_BY_EXTENSION[path.split(".").at(-1)?.toLowerCase()??""]??"application/octet-stream"}));
  if(assets.some((asset)=>asset.mimeType==="application/octet-stream"))return {decision:"quarantined",manifest:packageInspection.manifest,metadata:packageInspection.metadata,assets:[],expandedSize:preflight.expandedSize,findings:["unsupported-asset-type"]};
  return {decision:"accepted",manifest:packageInspection.manifest,metadata:packageInspection.metadata,assets:Object.freeze(assets),expandedSize:preflight.expandedSize,findings:[]};
}
