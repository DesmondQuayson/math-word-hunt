import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";

export const metadata = { title: "Classes" };

export default function ClassesPage() {
  const prototype = getTeacherPrototypeState();

  return (
    <TeacherShell currentPath="/teacher/classes">
      <PageHeader
        eyebrow="Teacher workspace · Classes"
        title="Organize the room without identifying students"
        description="A future class will keep a teacher’s activities and aggregate live-session history together. It will not require student accounts or a roster."
      />

      {prototype.enabled ? (
        <>
          <PrototypeDataNotice />
          <section aria-labelledby="class-list-heading" data-prototype-fixture="class-list">
            <div className="section-heading-row">
              <SectionHeader
                eyebrow="Demonstration records"
                title="Class list structure"
                id="class-list-heading"
                compact
              />
              <LinkButton href="/teacher/classes/new">Review class setup</LinkButton>
            </div>
            <div className="record-grid">
              {prototype.data.classes.map((classRecord) => (
                <article key={classRecord.id}>
                  <Card variant="interactive" className="record-card">
                    <div className="record-card-heading">
                      <h3>{classRecord.name}</h3>
                      <StatusBadge tone={classRecord.status === "active" ? "success" : "neutral"}>
                        {classRecord.status}
                      </StatusBadge>
                    </div>
                    <dl>
                      <div><dt>Grade</dt><dd>{classRecord.grade}</dd></div>
                      <div><dt>Section</dt><dd>{classRecord.section ?? "Not set"}</dd></div>
                      <div><dt>Activities</dt><dd>{classRecord.activityCount}</dd></div>
                    </dl>
                    <Link href={`/teacher/classes/${classRecord.id}`}>View demonstration structure</Link>
                  </Card>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          symbol="Aa"
          headingId="classes-empty-heading"
          title="No saved classes"
          description="Accounts and saved classes are not available yet. You can review the class form without creating a class."
          action={<LinkButton href="/teacher/classes/new">Review class setup</LinkButton>}
        />
      )}

      <section className="privacy-panel" aria-labelledby="class-privacy-heading">
        <div>
          <p className="card-kicker">Participation boundary</p>
          <h2 id="class-privacy-heading">A class is not a student directory</h2>
        </div>
        <ul>
          <li>No student accounts in the initial model.</li>
          <li>No student names required for team-based participation.</li>
          <li>Archive is reversible; destructive deletion needs later confirmation rules.</li>
        </ul>
      </section>
    </TeacherShell>
  );
}
