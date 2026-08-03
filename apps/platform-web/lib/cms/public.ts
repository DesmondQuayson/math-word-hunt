import "server-only";
import { isCmsDocumentKey,parseStructuredCmsDraft,type CmsDocumentKey,type StructuredCmsDraft } from "@math-vocabulary-hunt/platform-core";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type PublishedCmsDocument=Readonly<{id:string;key:CmsDocumentKey;version:number;content:StructuredCmsDraft;seo:Record<string,unknown>;media:Readonly<Record<string,Readonly<{altText:string;width:number;height:number}>>>}>;
export async function loadPublishedCmsDocument(key:string):Promise<PublishedCmsDocument|null>{
  if(!isCmsDocumentKey(key))return null; const client=createServiceSupabaseClient();if(!client)return null;
  const document=await client.from("cms_documents").select("id,document_key,published_version_number").eq("document_key",key).neq("publication_state","archived").not("published_version_number","is",null).maybeSingle();
  if(document.error||!document.data?.published_version_number)return null;
  const version=await client.from("cms_document_versions").select("content,seo_metadata").eq("document_id",document.data.id).eq("version_number",document.data.published_version_number).eq("publication_state","published").maybeSingle();
  if(version.error||!version.data)return null;const content=parseStructuredCmsDraft(version.data.content); if(!content)return null;
  const mediaIds=[...new Set(content.blocks.map(block=>block.mediaId).filter((id):id is string=>Boolean(id)))];const media:Record<string,{altText:string;width:number;height:number}>={};
  if(mediaIds.length){const assets=await client.from("cms_media_assets").select("id,published_version_number").in("id",mediaIds).neq("publication_state","archived");if(!assets.error){const rows=assets.data??[];const versions=rows.length?await client.from("cms_media_versions").select("media_asset_id,version_number,alt_text,width,height").in("media_asset_id",rows.map(row=>row.id)):null;for(const asset of rows){const item=versions?.data?.find(row=>row.media_asset_id===asset.id&&row.version_number===asset.published_version_number);if(item?.width&&item.height)media[asset.id]={altText:item.alt_text,width:item.width,height:item.height}}}}
  return{id:document.data.id,key,version:document.data.published_version_number,content,seo:(version.data.seo_metadata??{}) as Record<string,unknown>,media};
}
