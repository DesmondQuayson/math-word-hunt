import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminSecurityConfig } from "@/lib/admin/config";
import { loadAdminResourceDetail } from "@/lib/admin/resource-library";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectAdminAccess } from "@/lib/admin/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Admin resource", robots: { index: false, follow: false, noarchive: true } };

export default async function AdminResourcePage({ params, searchParams }: Readonly<{
  params: Promise<{ resourceId: string }>;
  searchParams: Promise<{ kind?: string; result?: string }>;
}>) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") notFound();
  const config = getAdminSecurityConfig();
  if (!config) notFound();
  const { resourceId } = await params;
  const detail = await loadAdminResourceDetail(resourceId);
  if (!detail) notFound();
  const query = await searchParams;
  const resource = detail.resource;
  const resultMessages:Record<string,string>={saved:"Draft saved.",revised:"Draft revision saved.",quarantined:"Unsafe file quarantined; metadata is preserved as a draft.","failed-closed":"The operation failed closed.","invalid-input":"The submitted values were rejected.","csrf-denied":"The request expired and was blocked."};
  const missing = [
    !resource.files.some((file) => file.role === "primary_pdf" && file.state === "accepted") ? `${detail.kind === "homework" ? "Homework" : "Quiz"} PDF` : null,
    !resource.files.some((file) => file.role === "answer_key_pdf" && file.state === "accepted") ? "Answer Key PDF" : null
  ].filter((item): item is string => Boolean(item));
  const back = `/admin?section=${detail.kind}&grade=${encodeURIComponent(resource.gradeId)}&topic=${encodeURIComponent(resource.topicId)}${detail.kind === "homework" ? `&lesson=${encodeURIComponent(resource.lessonId)}` : ""}`;

  return <Container width="wide" className="page-stack admin-resource-detail">
    <nav aria-label="Breadcrumb" className="admin-breadcrumb"><Link href="/admin">Admin</Link><span aria-hidden="true">/</span><Link href={back}>{detail.kind === "homework" ? "Homework" : "Quizzes"}</Link><span aria-hidden="true">/</span><span aria-current="page">Edit resource</span></nav>
    <PageHeader eyebrow={`${detail.kind === "homework" ? "Homework" : "Quiz"} / ${resource.hierarchy}`} title={resource.title} description="Edit this stable resource. Saving creates a new immutable draft version without changing its resource ID or deleting publication history." />
    {query.result ? <div className={`admin-state-banner ${["failed-closed","invalid-input","csrf-denied","quarantined"].includes(query.result) ? "admin-state-danger" : ""}`} role="status"><strong>{resultMessages[query.result]??"The operation failed closed."}</strong></div> : null}
    <div className="admin-detail-summary" aria-label="Resource status">
      <span className="admin-publication-badge" data-state={resource.publicationState}>{resource.publicationState.replaceAll("_", " ")}</span>
      <span>Resource ID <code>{resource.id}</code></span><span>Current version v{resource.versionNumber}</span>
      {resource.scopeStatus === "legacy" ? <span className="admin-legacy-badge">Legacy Scope</span> : null}
    </div>
    {missing.length ? <section className="admin-state-banner" aria-labelledby="missing-files"><strong id="missing-files">Required files still missing</strong><p>{missing.join(", ")}. Existing metadata and accepted files remain preserved.</p></section> : null}
    <section className="admin-detail-panel" aria-labelledby="edit-resource-heading">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">Draft editor</p><h2 id="edit-resource-heading">Resource metadata</h2></div><span>v{resource.versionNumber}</span></div>
      <form action="/admin/resources/revise" method="post" className="admin-resource-form">
        <input type="hidden" name="csrfToken" value={createAdminCsrfToken(config)} />
        <input type="hidden" name="resourceId" value={resource.id} /><input type="hidden" name="kind" value={detail.kind} />
        <input type="hidden" name="lockVersion" value={resource.lockVersion} /><input type="hidden" name="assignmentLockVersion" value={resource.assignmentLockVersion} />
        <input type="hidden" name="thumbnailPath" value={resource.thumbnailPath ?? ""} />
        <label><span>Title</span><input name="title" defaultValue={resource.title} maxLength={160} required /></label>
        <label><span>Safe slug</span><input name="slug" defaultValue={resource.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={96} required /></label>
        <label className="admin-form-wide"><span>Description</span><textarea name="description" defaultValue={resource.description} maxLength={4000} rows={5} required /></label>
        <label><span>Difficulty</span><select name="difficulty" defaultValue={resource.difficulty}><option value="core">Core</option><option value="support">Support</option><option value="challenge">Challenge</option></select></label>
        <label><span>{detail.kind === "homework" ? "Estimated" : "Recommended"} time (minutes)</span><input name="minutes" type="number" min={1} max={240} defaultValue={resource.minutes ?? 20} required /></label>
        <label><span>Order in {detail.kind === "homework" ? "lesson" : "topic"}</span><input name="sortOrder" type="number" min={1} max={32766} defaultValue={resource.sortOrder} required /></label>
        <label><span>Tags</span><input name="tags" defaultValue={resource.tags.join(", ")} /></label>
        <div className="admin-sticky-actions admin-form-wide"><button className="admin-primary-action" type="submit">Save new draft version</button><Link className="admin-secondary-action" href={back}>Back to {detail.kind === "homework" ? "Homework" : "Quizzes"}</Link></div>
      </form>
    </section>
    <section className="admin-detail-panel" aria-labelledby="resource-files-heading"><div className="admin-section-heading"><div><p className="admin-eyebrow">Private accepted assets</p><h2 id="resource-files-heading">Files</h2></div><span>{resource.files.length}</span></div>{resource.files.length ? <ul className="admin-detail-list">{resource.files.map((file) => <li key={file.id}><span><strong>{file.filename}</strong><small>{file.role.replaceAll("_", " ")} / {file.state}</small></span><a className="admin-secondary-action" href={`/admin/resources/${resource.id}/files/${file.id}`} target="_blank" rel="noreferrer">Preview</a></li>)}</ul> : <p>No accepted files are attached yet.</p>}</section>
    <section className="admin-detail-panel" aria-labelledby="resource-history-heading"><div className="admin-section-heading"><div><p className="admin-eyebrow">Immutable history</p><h2 id="resource-history-heading">Version timeline</h2></div><span>{resource.history.length}</span></div><ol className="admin-version-timeline">{resource.history.map((item) => <li key={item.versionNumber}><strong>v{item.versionNumber}</strong><span>{item.state.replaceAll("_", " ")}</span><small>{item.title}</small></li>)}</ol></section>
  </Container>;
}
