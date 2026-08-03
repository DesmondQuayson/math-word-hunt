import Link from "next/link";
import Image from "next/image";
import type { PublishedCmsDocument } from "@/lib/cms/public";

export function StructuredCmsContent({document}:Readonly<{document:PublishedCmsDocument}>){return <div className="cms-published" data-cms-key={document.key} data-cms-version={document.version}>
  <header><p className="eyebrow">Published version {document.version}</p><h1>{document.content.title}</h1>{document.content.description?<p>{document.content.description}</p>:null}</header>
  {document.content.blocks.map((block,index)=><section key={`${block.type}-${index}`} className={`cms-block cms-block-${block.type}`}>
    {block.heading?<h2>{block.heading}</h2>:null}{block.body?<p>{block.body}</p>:null}
    {block.mediaId&&document.media[block.mediaId]?<Image src={`/media/${block.mediaId}`} alt={document.media[block.mediaId].altText} width={document.media[block.mediaId].width} height={document.media[block.mediaId].height} unoptimized/>:null}
    {block.items?.length?<ul>{block.items.map((item,itemIndex)=><li key={`${item.title}-${itemIndex}`}><strong>{item.title}</strong>{item.body?<p>{item.body}</p>:null}{item.href?<Link href={item.href}>{item.title}</Link>:null}</li>)}</ul>:null}
    {block.href&&block.label?<a href={block.href} rel={block.href.startsWith("https://")?"noopener noreferrer":undefined}>{block.label}</a>:null}
  </section>)}
  {document.key==="terms"||document.key==="privacy"||document.key==="cancellation"||document.key==="refunds"?<p className="cms-version-note">This page is versioned. Published history is retained and cannot be silently replaced.</p>:null}
</div>}
