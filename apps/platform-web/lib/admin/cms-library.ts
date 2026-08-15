import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminCmsDocument=Readonly<{id:string;key:string;kind:string;state:string;version:number;publishedVersion:number|null;lockVersion:number;content:Record<string,unknown>;seo:Record<string,unknown>}>;
export type AdminCmsMedia=Readonly<{id:string;key:string;kind:string;state:string;version:number;lockVersion:number;filename:string;mimeType:string;altText:string;caption:string;attribution:string;license:string;width:number|null;height:number|null;inUse:boolean}>;
export type AdminCmsSnapshot=Readonly<{state:"ready"|"unavailable";documents:readonly AdminCmsDocument[];media:readonly AdminCmsMedia[]}>;

export async function loadAdminCmsLibrary():Promise<AdminCmsSnapshot>{
  const client=createServiceSupabaseClient(); if(!client)return{state:"unavailable",documents:[],media:[]};
  const [documents,media,usage]=await Promise.all([
    client.from("cms_documents").select("id,document_key,document_kind,publication_state,current_version_number,published_version_number,lock_version").order("document_key"),
    client.from("cms_media_assets").select("id,media_key,media_kind,publication_state,current_version_number,lock_version").neq("publication_state","archived").order("updated_at",{ascending:false}),
    client.from("cms_media_usage").select("media_asset_id")
  ]);
  if(documents.error||media.error||usage.error)return{state:"unavailable",documents:[],media:[]};
  const documentRows=documents.data??[],mediaRows=media.data??[];
  const [versions,mediaVersions]=await Promise.all([
    documentRows.length?client.from("cms_document_versions").select("document_id,version_number,content,seo_metadata").in("document_id",documentRows.map(x=>x.id)):Promise.resolve({data:[],error:null}),
    mediaRows.length?client.from("cms_media_versions").select("media_asset_id,version_number,original_filename,mime_type,alt_text,caption,attribution,license,width,height").in("media_asset_id",mediaRows.map(x=>x.id)):Promise.resolve({data:[],error:null})
  ]);
  if(versions.error||mediaVersions.error)return{state:"unavailable",documents:[],media:[]};
  const used=new Set((usage.data??[]).map(x=>x.media_asset_id));
  return{state:"ready",documents:documentRows.map(row=>{const v=(versions.data??[]).find(x=>x.document_id===row.id&&x.version_number===row.current_version_number);return{id:row.id,key:row.document_key,kind:row.document_kind,state:row.publication_state,version:row.current_version_number,publishedVersion:row.published_version_number,lockVersion:Number(row.lock_version),content:(v?.content??{}) as Record<string,unknown>,seo:(v?.seo_metadata??{}) as Record<string,unknown>}}),media:mediaRows.map(row=>{const v=(mediaVersions.data??[]).find(x=>x.media_asset_id===row.id&&x.version_number===row.current_version_number);return{id:row.id,key:row.media_key,kind:row.media_kind,state:row.publication_state,version:row.current_version_number,lockVersion:Number(row.lock_version),filename:v?.original_filename??"",mimeType:v?.mime_type??"",altText:v?.alt_text??"",caption:v?.caption??"",attribution:v?.attribution??"",license:v?.license??"",width:v?.width??null,height:v?.height??null,inUse:used.has(row.id)}})};
}
