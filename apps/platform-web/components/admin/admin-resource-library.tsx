"use client";

import { useMemo, useState } from "react";

import { AdminTaxonomyManager } from "@/components/admin/admin-taxonomy-manager";
import type { AdminResourceLibrarySnapshot, AdminLibraryResource } from "@/lib/admin/resource-library";
import type { AdminTaxonomySnapshot } from "@/lib/admin/taxonomy";

export function AdminResourceLibrary({ kind, snapshot, taxonomy, csrfToken, result, taxonomyResult }: Readonly<{
  kind: "homework" | "quizzes";
  snapshot: AdminResourceLibrarySnapshot;
  taxonomy: AdminTaxonomySnapshot;
  csrfToken: string;
  result?: string;
  taxonomyResult?: string;
}>) {
  const singular = kind === "homework" ? "Homework" : "Quiz";
  const [query,setQuery]=useState("");const [grade,setGrade]=useState("");const [topic,setTopic]=useState("");const [lesson,setLesson]=useState("");const [uploading,setUploading]=useState(false);
  const filtered=useMemo(()=>snapshot.resources.filter((resource)=>{
    const text=`${resource.title} ${resource.description} ${resource.hierarchy} ${resource.tags.join(" ")}`.toLowerCase();
    return(!query||text.includes(query.toLowerCase()))&&(!grade||resource.gradeId===grade)&&(!topic||resource.topicId===topic)&&(!lesson||resource.lessonId===lesson);
  }),[snapshot.resources,query,grade,topic,lesson]);
  const topics=taxonomy.topics.filter((item)=>!grade||item.gradeId===grade);const lessons=taxonomy.lessons.filter((item)=>!topic||item.topicId===topic);
  return <div className="admin-resource-library">
    <header className="admin-module-hero"><div><p className="admin-eyebrow">Grade → Topic → Lesson</p><h1>{singular} library</h1><p>Upload reviewed interactive PDFs, separate answer keys, thumbnails, and preview images. Files stay private until the owner publishes an accepted version.</p></div><a className="admin-primary-action" href={snapshot.lessons.length?`#add-${kind}`:`#${kind}-taxonomy`}>Add {singular}</a></header>
    {result ? <Outcome value={result} /> : null}
    {snapshot.state === "unavailable" ? <div className="admin-state-banner admin-state-danger" role="alert"><strong>Resource library unavailable.</strong> No write controls are shown because server data could not be verified.</div> : null}
    {snapshot.state === "ready" ? <AdminTaxonomyManager snapshot={taxonomy} csrfToken={csrfToken} section={kind} result={taxonomyResult} /> : null}
    {snapshot.state === "ready" && snapshot.lessons.length > 0 ? <details className="admin-add-resource" id={`add-${kind}`} open>
      <summary>Add {singular}</summary>
      <form action="/admin/resources/upload" method="post" encType="multipart/form-data" className="admin-resource-form" onSubmit={()=>setUploading(true)}>
        <input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="kind" value={kind} />
        <label><span>Lesson</span><select name="lessonId" required>{snapshot.lessons.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Title</span><input name="title" maxLength={160} required /></label>
        <label><span>Slug</span><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={96} required /></label>
        <label className="admin-form-wide"><span>Description</span><textarea name="description" maxLength={4000} rows={4} required /></label>
        <label><span>Difficulty</span><select name="difficulty"><option value="core">Core</option><option value="support">Support</option><option value="challenge">Challenge</option></select></label>
        <label><span>{kind === "homework" ? "Estimated" : "Recommended"} time (minutes)</span><input name="minutes" type="number" min={1} max={240} defaultValue={20} required /></label>
        <label><span>Order in lesson</span><input name="sortOrder" type="number" min={1} max={32766} defaultValue={1} required /><small>Use a number not already assigned to another game, homework item, answer key, or quiz in this lesson.</small></label>
        <label><span>Tags</span><input name="tags" placeholder="fractions, grade-4" /></label>
        <label className="admin-form-wide"><span>Interactive {singular} PDF</span><input name="primaryPdf" type="file" accept="application/pdf,.pdf" required /><small>20 MB maximum. AcroForms and educational images are allowed; scripts, launch actions, attachments, and executable actions are quarantined.</small></label>
        <label className="admin-form-wide"><span>{singular} Answer Key PDF</span><input name="answerPdf" type="file" accept="application/pdf,.pdf" /><small>Optional and stored as a separately labeled resource.</small></label>
        <label><span>Thumbnail</span><input name="thumbnail" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <label><span>Preview images</span><input name="previews" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label>
        <label><span>Publication state</span><select name="status"><option value="draft">Draft</option></select><small>Validation and publication remain separate owner actions.</small></label>
        <button className="admin-primary-action" type="submit" disabled={uploading}>{uploading?"Validating private files…":"Save draft"}</button><span className="admin-upload-status" aria-live="polite">{uploading?"Upload in progress. Keep this page open.":""}</span>
      </form>
    </details> : snapshot.state === "ready" ? <div className="admin-library-empty"><strong>Add a curriculum path first</strong><p>The Add {singular} action is ready. Create a Grade, Topic, and Lesson above to enable file selection without inventing curriculum.</p></div> : null}
    {snapshot.state === "ready" ? <section aria-labelledby={`${kind}-resource-list`}><div className="admin-section-heading"><div><p className="admin-eyebrow">Owner inventory</p><h2 id={`${kind}-resource-list`}>{singular} resources</h2></div><span>{filtered.length} of {snapshot.resources.length}</span></div>
      <div className="admin-library-filters" role="search" aria-label={`Search and filter ${kind}`}><label><span>Search</span><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={`Search ${kind}`} /></label><label><span>Grade</span><select value={grade} onChange={(event)=>{setGrade(event.target.value);setTopic("");setLesson("")}}><option value="">All grades</option>{taxonomy.grades.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span>Topic</span><select value={topic} onChange={(event)=>{setTopic(event.target.value);setLesson("")}}><option value="">All topics</option>{topics.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span>Lesson</span><select value={lesson} onChange={(event)=>setLesson(event.target.value)}><option value="">All lessons</option>{lessons.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
      {filtered.length ? <div className="admin-table-scroll"><table className="admin-resource-table"><thead><tr><th>Resource</th><th>Path</th><th>Status</th><th>Version</th><th>Operations</th></tr></thead><tbody>{filtered.map((resource)=><ResourceRow key={resource.id} resource={resource} kind={kind} csrfToken={csrfToken}/>)}</tbody></table></div> : <div className="admin-library-empty"><strong>{snapshot.resources.length?"No resources match these filters":`No ${kind} resources yet`}</strong><p>{snapshot.resources.length?"Clear or adjust the search and curriculum filters.":"Use the visible Add action to save the first reviewed draft."}</p></div>}
    </section> : null}
  </div>;
}

function Outcome({value}:{value:string}){const danger=["quarantined","quarantined-replacement","failed-closed","invalid-input","csrf-denied"].includes(value);const messages:Record<string,string>={saved:"Draft saved.",replaced:"Draft file replaced.","quarantined-replacement":"Replacement rejected; the accepted draft file remains active.",quarantined:"Unsafe file quarantined.",validating:"Validation started.",ready_for_review:"Ready for review.",published:"Resource published.",archived:"Resource archived.","rolled-back":"Published version restored."};return <div className={`admin-state-banner ${danger?"admin-state-danger":""}`} role="status"><strong>{messages[value]??"The operation failed closed."}</strong> The server-owned resource state is authoritative.</div>}

function ResourceRow({resource,kind,csrfToken}:{resource:AdminLibraryResource;kind:"homework"|"quizzes";csrfToken:string}){const accepted=resource.files.filter((file)=>file.state==="accepted");const next=resource.publicationState==="draft"?["validating","Validate"]:resource.publicationState==="validating"?["ready_for_review","Mark ready for review"]:resource.publicationState==="ready_for_review"?["published","Publish"]:null;return <tr><td><strong>{resource.title}</strong><small>{resource.description}</small><span className="admin-resource-tags">{resource.tags.join(" · ")}</span></td><td>{resource.hierarchy}</td><td><span className="admin-publication-badge" data-state={resource.publicationState}>{resource.publicationState.replaceAll("_"," ")}</span></td><td>v{resource.versionNumber}</td><td><details className="admin-row-actions" open><summary>Manage</summary><div>
  {accepted.map((file)=><div className="admin-file-operation" key={file.id}><span>{file.filename}</span><a className="admin-secondary-action" href={`/admin/resources/${resource.id}/files/${file.id}`} target="_blank" rel="noreferrer">Preview {file.role.replaceAll("_"," ")}</a>{resource.publicationState==="draft"?<form action="/admin/resources/replace" method="post" encType="multipart/form-data"><input type="hidden" name="csrfToken" value={csrfToken}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="resourceId" value={resource.id}/><input type="hidden" name="fileId" value={file.id}/><label><span>Replace {file.role.replaceAll("_"," ")}</span><input name="replacement" type="file" accept={file.role.includes("pdf")?"application/pdf,.pdf":"image/png,image/jpeg,image/webp"} required/></label><button className="admin-secondary-action">Replace draft file</button></form>:null}</div>)}
  {next?<form action="/admin/resources/status" method="post"><input type="hidden" name="csrfToken" value={csrfToken}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="resourceId" value={resource.id}/><input type="hidden" name="versionNumber" value={resource.versionNumber}/><input type="hidden" name="lockVersion" value={resource.lockVersion}/><button className={next[0]==="published"?"admin-primary-action":"admin-secondary-action"} name="targetState" value={next[0]}>{next[1]}</button></form>:null}
  {resource.publicationState!=="archived"?<form action="/admin/resources/archive" method="post"><input type="hidden" name="csrfToken" value={csrfToken}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="resourceId" value={resource.id}/><input type="hidden" name="lockVersion" value={resource.lockVersion}/><button className="admin-secondary-action">Archive</button></form>:null}
  <details className="admin-version-history"><summary>Version history</summary><ol>{resource.history.map((item)=><li key={item.versionNumber}><span>v{item.versionNumber} · {item.state.replaceAll("_"," ")}</span>{item.state==="published"&&item.versionNumber!==resource.versionNumber&&resource.publicationState!=="archived"?<form action="/admin/resources/rollback" method="post"><input type="hidden" name="csrfToken" value={csrfToken}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="resourceId" value={resource.id}/><input type="hidden" name="targetVersion" value={item.versionNumber}/><input type="hidden" name="lockVersion" value={resource.lockVersion}/><button className="admin-secondary-action">Restore this version</button></form>:null}</li>)}</ol></details>
</div></details></td></tr>}
