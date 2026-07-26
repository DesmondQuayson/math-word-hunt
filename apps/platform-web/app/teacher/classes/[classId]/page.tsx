import { archiveClassAction } from "@/app/teacher-actions";
import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { getPrototypeClassById, getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";
import { createServerRepositories } from "@/lib/repositories/server-repositories";

type Props = Readonly<{ params: Promise<{ classId: string }> }>;
export const metadata = { title: "Class details" };

export default async function ClassDetailPage({ params }: Props) {
  const { classId } = await params;
  const prototype = getTeacherPrototypeState();
  const prototypeRecord = prototype.enabled ? getPrototypeClassById(classId) : null;
  const context = prototype.enabled ? null : await resolveTeacherContext();
  const repositories = context?.status === "active" ? await createServerRepositories() : null;
  const result = repositories && context?.userId ? await repositories.classes.getById(context.userId, classId) : null;
  const record = result?.ok ? result.value : null;
  const title = prototypeRecord?.name ?? record?.className ?? "Class detail";

  return <TeacherShell currentPath={`/teacher/classes/${classId}`} accountNote={record ? "Local teacher data is enabled. No student roster is stored." : undefined}>
    <Breadcrumbs items={[{ label: "Classes", href: "/teacher/classes" }, { label: title }]} />
    {prototypeRecord ? <><PageHeader eyebrow="Demonstration class · Not saved" title={prototypeRecord.name} description="This demonstration is isolated from authenticated local teacher data."><StatusBadge tone="success">{prototypeRecord.status}</StatusBadge></PageHeader><PrototypeDataNotice /><dl className="definition-grid" data-prototype-fixture="class-detail"><div><dt>Grade</dt><dd>{prototypeRecord.grade}</dd></div><div><dt>Period or section</dt><dd>{prototypeRecord.section ?? "Not set"}</dd></div><div><dt>Created</dt><dd>{prototypeRecord.createdLabel}</dd></div><div><dt>Activities</dt><dd>{prototypeRecord.activityCount}</dd></div></dl></> : record ? <><PageHeader eyebrow="Teacher-owned class · Saved locally" title={record.className} description="This record belongs to the authenticated teacher and contains no student roster."><StatusBadge tone={record.status === "active" ? "success" : "neutral"}>{record.status}</StatusBadge></PageHeader><dl className="definition-grid" data-testid="real-class-detail"><div><dt>Grade</dt><dd>{record.grade ?? "Not set"}</dd></div><div><dt>Period or section</dt><dd>{record.periodOrSection ?? "Not set"}</dd></div><div><dt>Status</dt><dd>{record.status}</dd></div></dl>{record.status === "active" ? <form action={archiveClassAction}><input type="hidden" name="classId" value={record.classId} /><button className="button button-secondary" type="submit">Archive class</button></form> : null}</> : <><PageHeader eyebrow={prototype.enabled || context?.status === "unconfigured" ? "Class details · Preview" : "Class details"} title={prototype.enabled || context?.status === "unconfigured" ? "No class record is available" : "Class unavailable"} description={prototype.enabled || context?.status === "unconfigured" ? "No classes are saved in this preview. Changing the page address cannot create or reveal a class." : "The class does not exist, does not belong to this teacher, or the account cannot read protected data."} /><EmptyState symbol="Aa" headingId="class-detail-empty" title="Return to the class overview" description={prototype.enabled || context?.status === "unconfigured" ? "This preview can show only its named demonstration classes. An unknown class address stays empty." : "Changing the page address cannot reveal another teacher’s class."} action={<LinkButton href="/teacher/classes">Back to classes</LinkButton>} /></>}
  </TeacherShell>;
}
