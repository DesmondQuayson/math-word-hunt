import type { AdminTaxonomySnapshot } from "@/lib/admin/taxonomy";

export function AdminTaxonomyManager({ snapshot, csrfToken, section, result }: Readonly<{
  snapshot: AdminTaxonomySnapshot;
  csrfToken: string;
  section: "games" | "homework" | "quizzes";
  result?: string;
}>) {
  if (snapshot.state === "unavailable") return <div className="admin-state-banner admin-state-danger" role="alert"><strong>Curriculum paths are unavailable.</strong> Creation controls failed closed.</div>;
  return <section className="admin-taxonomy" id={`${section}-taxonomy`} aria-labelledby={`${section}-taxonomy-title`}>
    <div className="admin-section-heading"><div><p className="admin-eyebrow">Required content path</p><h2 id={`${section}-taxonomy-title`}>Grade → Topic → Lesson</h2></div><span>{snapshot.lessons.length} lessons</span></div>
    <p className="admin-taxonomy-intro">Create only reviewed curriculum labels. Each step becomes available after its parent exists.</p>
    {result ? <div className={`admin-state-banner ${result === "created" ? "" : "admin-state-danger"}`} role="status"><strong>{result === "created" ? "Curriculum path updated." : "The curriculum update failed closed."}</strong></div> : null}
    <div className="admin-taxonomy-steps">
      <TaxonomyForm action="grade" title="1. Add grade" csrfToken={csrfToken} section={section}>
        <label><span>Grade number</span><input name="gradeNumber" type="number" min={1} max={9} required /></label>
        <label><span>Display title</span><input name="title" placeholder="Grade 6" maxLength={80} required /></label>
        <label><span>Slug</span><input name="slug" placeholder="grade-6" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required /></label>
      </TaxonomyForm>
      <TaxonomyForm action="topic" title="2. Add topic" csrfToken={csrfToken} section={section} disabled={!snapshot.grades.length}>
        <label><span>Grade</span><select name="parentId" required disabled={!snapshot.grades.length}>{snapshot.grades.map((grade) => <option value={grade.id} key={grade.id}>{grade.title}</option>)}</select></label>
        <label><span>Topic title</span><input name="title" placeholder="Fractions" maxLength={120} required disabled={!snapshot.grades.length} /></label>
        <label><span>Slug</span><input name="slug" placeholder="fractions" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required disabled={!snapshot.grades.length} /></label>
      </TaxonomyForm>
      <TaxonomyForm action="lesson" title="3. Add lesson" csrfToken={csrfToken} section={section} disabled={!snapshot.topics.length}>
        <label><span>Topic</span><select name="parentId" required disabled={!snapshot.topics.length}>{snapshot.topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.gradeTitle} / {topic.title}</option>)}</select></label>
        <label><span>Lesson title</span><input name="title" placeholder="Equivalent fractions" maxLength={160} required disabled={!snapshot.topics.length} /></label>
        <label><span>Slug</span><input name="slug" placeholder="equivalent-fractions" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required disabled={!snapshot.topics.length} /></label>
      </TaxonomyForm>
    </div>
  </section>;
}

function TaxonomyForm({ action, title, csrfToken, section, disabled = false, children }: Readonly<{
  action: "grade" | "topic" | "lesson";
  title: string;
  csrfToken: string;
  section: string;
  disabled?: boolean;
  children: React.ReactNode;
}>) {
  return <form action="/admin/taxonomy/create" method="post" className="admin-taxonomy-step" data-disabled={disabled || undefined}>
    <input type="hidden" name="csrfToken" value={csrfToken} /><input type="hidden" name="kind" value={action} /><input type="hidden" name="section" value={section} />
    <h3>{title}</h3>{children}<label><span>Order</span><input name="sortOrder" type="number" min={1} max={32767} defaultValue={1} required disabled={disabled} /></label>
    <button className="admin-secondary-action" type="submit" disabled={disabled}>Create {action}</button>
  </form>;
}
