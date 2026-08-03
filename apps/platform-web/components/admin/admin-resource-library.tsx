import type { AdminResourceLibrarySnapshot } from "@/lib/admin/resource-library";

export function AdminResourceLibrary({ kind, snapshot, csrfToken, result }: Readonly<{
  kind: "homework" | "quizzes";
  snapshot: AdminResourceLibrarySnapshot;
  csrfToken: string;
  result?: string;
}>) {
  const singular = kind === "homework" ? "Homework" : "Quiz";
  const outcome = result;
  return <div className="admin-resource-library">
    <header><p className="admin-eyebrow">Grade → Topic → Lesson</p><h1>{singular} library</h1><p>Upload reviewed interactive PDFs, separate answer keys, thumbnails, and preview images. Files stay private until the owner publishes an accepted version.</p></header>
    {outcome ? <div className={`admin-state-banner ${["quarantined","failed-closed","invalid-input","csrf-denied"].includes(outcome)?"admin-state-danger":""}`} role="status"><strong>{outcome==="saved"?"Draft saved.":outcome==="published"?"Resource published.":outcome==="quarantined"?"Unsafe file quarantined.":"The operation failed closed."}</strong> {outcome==="quarantined"?"Review the validation findings; quarantined files cannot be published or downloaded.":"The server-owned resource state is authoritative."}</div>:null}
    {snapshot.state === "unavailable" ? <div className="admin-state-banner admin-state-danger" role="alert"><strong>Resource library unavailable.</strong> No write controls are shown because server data could not be verified.</div> : null}
    {snapshot.state === "ready" && snapshot.lessons.length === 0 ? <div className="admin-library-empty"><strong>Create the taxonomy first</strong><p>No Grade → Topic → Lesson records exist. Phase 8B deliberately seeds no curriculum.</p></div> : null}
    {snapshot.state === "ready" && snapshot.lessons.length > 0 ? <details className="admin-add-resource" open>
      <summary>Add {singular.toLowerCase()} resource</summary>
      <form action="/admin/resources/upload" method="post" encType="multipart/form-data" className="admin-resource-form">
        <input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="kind" value={kind} />
        <label><span>Lesson</span><select name="lessonId" required>{snapshot.lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.label}</option>)}</select></label>
        <label><span>Title</span><input name="title" maxLength={160} required /></label>
        <label><span>Slug</span><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={96} required /></label>
        <label className="admin-form-wide"><span>Description</span><textarea name="description" maxLength={4000} rows={4} required /></label>
        <label><span>Difficulty</span><select name="difficulty"><option value="core">Core</option><option value="support">Support</option><option value="challenge">Challenge</option></select></label>
        <label><span>{kind === "homework" ? "Estimated" : "Recommended"} time (minutes)</span><input name="minutes" type="number" min={1} max={240} defaultValue={20} required /></label>
        <label><span>Order in lesson</span><input name="sortOrder" type="number" min={1} max={32766} defaultValue={1} required /></label>
        <label><span>Tags</span><input name="tags" placeholder="fractions, grade-4" /></label>
        <label className="admin-form-wide"><span>Interactive {singular} PDF</span><input name="primaryPdf" type="file" accept="application/pdf,.pdf" required /><small>20 MB maximum. AcroForms allowed; scripts, launch actions, attachments, and external executable actions are rejected.</small></label>
        <label className="admin-form-wide"><span>Answer Key PDF</span><input name="answerPdf" type="file" accept="application/pdf,.pdf" /><small>Optional and stored as a separately labeled resource.</small></label>
        <label><span>Thumbnail</span><input name="thumbnail" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <label><span>Preview images</span><input name="previews" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label>
        <label><span>Status</span><select name="status"><option value="draft">Save as draft</option></select><small>Publication requires a separate owner review action.</small></label>
        <label><span>Publish schedule</span><input type="datetime-local" name="publishAt" disabled /><small>Scheduling is not enabled; no date will be inferred.</small></label>
        <button className="admin-primary-action" type="submit">Validate and save draft</button>
      </form>
    </details> : null}
    {snapshot.state === "ready" ? <section aria-labelledby={`${kind}-resource-list`}><div className="admin-section-heading"><div><p className="admin-eyebrow">Owner inventory</p><h2 id={`${kind}-resource-list`}>{singular} resources</h2></div><span>{snapshot.resources.length} records</span></div>
      {snapshot.resources.length ? <div className="admin-library-list">{snapshot.resources.map((resource) => <article key={resource.id}>
        <div><p className="admin-eyebrow">{resource.hierarchy}</p><h3>{resource.title}</h3><p>{resource.description}</p></div>
        <dl><div><dt>Status</dt><dd>{resource.publicationState.replaceAll("_", " ")}</dd></div><div><dt>Version</dt><dd>{resource.versionNumber}</dd></div><div><dt>Files</dt><dd>{resource.files.filter((file) => file.state === "accepted").length} accepted</dd></div></dl>
        <ul>{resource.files.map((file) => <li key={file.id}><strong>{file.role.replaceAll("_", " ")}</strong><span>{file.filename}</span><em>{file.state}</em></li>)}</ul>
        {resource.publicationState === "draft" && resource.files.some((file) => file.state === "accepted" && ["primary_pdf","answer_key_pdf"].includes(file.role)) ? <form action="/admin/resources/publish" method="post"><input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="resourceId" value={resource.id} /><input type="hidden" name="versionNumber" value={resource.versionNumber} /><input type="hidden" name="lockVersion" value={resource.lockVersion} /><button className="admin-secondary-action" type="submit">Review and publish</button></form> : null}
      </article>)}</div> : <div className="admin-library-empty"><strong>No {kind} resources yet</strong><p>Add the first owner-reviewed PDF without fabricating curriculum content.</p></div>}
    </section> : null}
  </div>;
}
