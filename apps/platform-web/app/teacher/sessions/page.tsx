import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";

export const metadata = { title: "Live sessions prototype" };

export default function SessionsPage() {
  const prototype = getTeacherPrototypeState();

  return (
    <TeacherShell currentPath="/teacher/sessions">
      <PageHeader
        eyebrow="Teacher workspace · Live Sessions"
        title="Know which kind of session you are starting"
        description="The current game runs locally for a shared classroom screen. Future managed sessions would add teacher-owned setup and recovery, but no realtime service exists yet."
      />

      <div className="session-boundary-grid">
        <Card variant="highlighted" className="session-boundary-card">
          <p className="card-kicker">Available now</p>
          <h2>Local classroom v7</h2>
          <p>Teacher-led play on a shared display. No account, remote join, or saved session is required.</p>
          <LinkButton href="/play">Launch current game path</LinkButton>
        </Card>
        <Card variant="muted" className="session-boundary-card">
          <p className="card-kicker">Future managed workflow</p>
          <h2>Platform session</h2>
          <p>Conceptual setup, ready, active, reconnect, and completed states. No remote devices can join.</p>
          <LinkButton href="/teacher/sessions/new" variant="secondary">Review setup prototype</LinkButton>
        </Card>
      </div>

      {prototype.enabled ? (
        <>
          <PrototypeDataNotice />
          <section aria-labelledby="session-list-heading" data-prototype-fixture="session-list">
            <SectionHeader eyebrow="Demonstration records" title="Session state structure" id="session-list-heading" compact />
            <div className="record-grid">
              {prototype.data.sessions.map((session) => (
                <article key={session.id}>
                  <Card className="record-card">
                    <div className="record-card-heading">
                      <h3>{session.title}</h3>
                      <StatusBadge tone={session.status === "completed" ? "success" : "information"}>{session.status}</StatusBadge>
                    </div>
                    <p>{session.classLabel}</p>
                    <dl>
                      <div><dt>Teams</dt><dd>{session.teams}</dd></div>
                      <div><dt>Terms</dt><dd>{session.termsReviewed}</dd></div>
                    </dl>
                    <p className="record-disclaimer">Demonstration only · No realtime connection</p>
                  </Card>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          symbol="▶"
          headingId="sessions-empty-heading"
          title="No managed sessions"
          description="No session service, reconnect state, remote participant channel, or saved history is connected."
          action={<LinkButton href="/teacher/sessions/new">Review session setup</LinkButton>}
        />
      )}

      <Notice label="Remote participation boundary" tone="warning">
        <strong>Remote student devices cannot join.</strong>
        <p>Realtime networking and participant identity are deliberately outside this phase.</p>
      </Notice>
    </TeacherShell>
  );
}
