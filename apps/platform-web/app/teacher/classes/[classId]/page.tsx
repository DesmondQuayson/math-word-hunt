import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { TeacherTaskCard } from "@/components/teacher/teacher-task-card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPrototypeClassById } from "@/lib/prototype/teacher-fixtures.server";

type ClassDetailPageProps = Readonly<{
  params: Promise<{ classId: string }>;
}>;

export const metadata = { title: "Class details" };

export default async function ClassDetailPage({ params }: ClassDetailPageProps) {
  const { classId } = await params;
  const classRecord = getPrototypeClassById(classId);

  return (
    <TeacherShell currentPath={`/teacher/classes/${classId}`}>
      <Breadcrumbs items={[
        { label: "Classes", href: "/teacher/classes" },
        { label: classRecord?.name ?? "Class detail" }
      ]} />

      {classRecord ? (
        <>
          <PageHeader
            eyebrow="Demonstration class · Not saved"
            title={classRecord.name}
            description="This demonstration shows how a future teacher-owned class could connect activities, live sessions, and aggregate reports without becoming a student directory."
          >
            <StatusBadge tone="success">{classRecord.status}</StatusBadge>
          </PageHeader>
          <PrototypeDataNotice />
          <dl className="definition-grid" data-prototype-fixture="class-detail">
            <div><dt>Grade</dt><dd>{classRecord.grade}</dd></div>
            <div><dt>Period or section</dt><dd>{classRecord.section ?? "Not set"}</dd></div>
            <div><dt>Created</dt><dd>{classRecord.createdLabel}</dd></div>
            <div><dt>Activities</dt><dd>{classRecord.activityCount}</dd></div>
          </dl>
          <section aria-labelledby="class-workflow-heading">
            <SectionHeader
              eyebrow="Future class workflow"
              title="Plan, run, and review"
              id="class-workflow-heading"
              compact
            />
            <div className="teacher-task-grid teacher-task-grid-compact">
              <TeacherTaskCard marker="+" title="Activity" description="Choose curriculum and classroom settings." href="/teacher/activities/new" actionLabel="Review activity setup" />
              <TeacherTaskCard marker="▶" title="Live session" description="Compare future setup with the current v7 game." href="/teacher/sessions/new" actionLabel="Review session setup" />
              <TeacherTaskCard marker="∑" title="Report" description="Review only aggregate demonstration information." href="/teacher/reports" actionLabel="Review aggregate reports" />
            </div>
          </section>
        </>
      ) : (
        <>
          <PageHeader
            eyebrow="Class details · Preview"
            title="No class record is available"
            description="No classes are saved in this preview. Changing the page address cannot create or reveal a class."
          />
          <EmptyState
            symbol="Aa"
            headingId="class-detail-empty"
            title="Return to the class overview"
            description="This preview can show only its named demonstration classes. An unknown class address stays empty."
            action={<LinkButton href="/teacher/classes">Back to classes</LinkButton>}
          />
        </>
      )}
    </TeacherShell>
  );
}
