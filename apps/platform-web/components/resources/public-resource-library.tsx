import Image from "next/image";
import Link from "next/link";
import type { PublicResource } from "@/lib/resources/catalog";

export function PublicResourceLibrary({kind,resources}:Readonly<{kind:"homework"|"quizzes";resources:readonly PublicResource[]}>) {
  const title=kind==="homework"?"Homework":"Quizzes";
  return <div className="public-resource-shell">
    <header className="public-resource-hero"><p className="eyebrow">Grade → Topic → Lesson</p><h1>{title}</h1><p>Browse owner-reviewed math resources by curriculum location. Preview metadata is public; full PDFs and separately labeled answer keys require a valid subscription entitlement.</p></header>
    {resources.length ? <div className="public-resource-groups">{resources.map((resource)=><article className="public-resource-card" key={resource.id}>
      {resource.previewFileIds[0] ? <Image unoptimized width={640} height={360} sizes="(max-width: 48rem) 100vw, 18rem" src={`/resources/${resource.id}/preview/${resource.previewFileIds[0]}`} alt="" /> : <div className="public-resource-placeholder" aria-hidden="true">{resource.grade.replace(/[^0-9]/g,"")||"M"}</div>}
      <div><p className="public-resource-path">{resource.grade} / {resource.topic} / {resource.lesson}</p><h2>{resource.title}</h2>{resource.resourceType.includes("answer_key")?<strong className="answer-key-label">Answer key</strong>:null}<p>{resource.description}</p>
        <dl><div><dt>Difficulty</dt><dd>{resource.difficulty??"Not specified"}</dd></div><div><dt>Time</dt><dd>{resource.minutes?`${resource.minutes} minutes`:"Not specified"}</dd></div></dl>
        <div className="public-resource-actions"><Link href={`/resources/${resource.id}`}>Preview details</Link>{resource.downloadable?<a href={`/resources/${resource.id}/download`}>Download {resource.resourceType.includes("answer_key")?"answer key":"PDF"}</a>:<span>Download unavailable</span>}</div>
      </div>
    </article>)}</div>:<div className="public-resource-empty"><strong>No published {title.toLowerCase()} yet</strong><p>The owner has not published resources for this library. No curriculum content has been fabricated.</p></div>}
  </div>;
}
