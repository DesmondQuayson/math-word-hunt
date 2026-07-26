import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { SummaryMetric } from "@/components/teacher/summary-metric";
import { TeacherTaskCard } from "@/components/teacher/teacher-task-card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CURRICULUM_INVENTORY } from "@/lib/adapters/curriculum-summary";
import { getPlatformAccess } from "@/lib/adapters/entitlements";
import { getTeacherSession } from "@/lib/adapters/identity";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";

export const metadata = { title: "Teacher overview" };

export default async function TeacherPage() {
  const [session, access] = await Promise.all([
    getTeacherSession(),
    getPlatformAccess()
  ]);
  const prototype = getTeacherPrototypeState();

  return (
    <TeacherShell currentPath="/teacher">
      <PageHeader
        eyebrow="Teacher workspace · Prototype"
        title="Your next classroom move, made clear"
        description="Plan vocabulary practice, launch the preserved game, and understand where future class and reporting tools will live—without implying that accounts or saved data work today."
      />

      {prototype.enabled ? <PrototypeDataNotice /> : (
        <Notice label="Teacher session status" tone="information">
          <strong>Account features are in development.</strong>
          <p>{session.message} No classes, activities, sessions, or reports are saved.</p>
        </Notice>
      )}

      {prototype.enabled ? (
        <section aria-labelledby="demo-summary-heading">
          <SectionHeader
            eyebrow="Demonstration workspace"
            title="Layout summary"
            id="demo-summary-heading"
            compact
          />
          <div className="metric-grid" data-prototype-fixture="overview-summary">
            <SummaryMetric label="Sample classes" value={prototype.data.classes.length} detail="Not saved" />
            <SummaryMetric label="Sample activities" value={prototype.data.activities.length} detail="Not assigned" />
            <SummaryMetric label="Sample sessions" value={prototype.data.sessions.length} detail="No realtime service" />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="next-step-heading">
        <SectionHeader
          eyebrow="Under classroom time pressure"
          title="What should I do next?"
          description="Start with the action that matches the room you are in."
          id="next-step-heading"
        />
        <div className="teacher-task-grid">
          <TeacherTaskCard
            marker="▶"
            title="Launch the current game"
            description="Open the preserved v7 experience for teacher-led, local classroom play."
            href="/play"
            actionLabel="Go to game gateway"
            current
          />
          <TeacherTaskCard
            marker="Aa"
            title="Check curriculum readiness"
            description={`${CURRICULUM_INVENTORY.playableLessons} lessons are playable; thin and missing lessons remain clearly labeled.`}
            href="/teacher/curriculum"
            actionLabel="Browse curriculum"
          />
          <TeacherTaskCard
            marker="+"
            title="Prototype an activity"
            description="Walk through grade, lesson, mode, time, and team choices without saving an assignment."
            href="/teacher/activities/new"
            actionLabel="Open activity prototype"
          />
          <TeacherTaskCard
            marker="□"
            title="Plan a class structure"
            description="Preview a privacy-minimized class setup that never asks for student names."
            href="/teacher/classes/new"
            actionLabel="Open class prototype"
          />
        </div>
      </section>

      <section className="readiness-panel" aria-labelledby="readiness-heading">
        <div>
          <p className="card-kicker">Ready now</p>
          <h2 id="readiness-heading">The independent v7 classroom game</h2>
          <p>
            Grades 6–8, keyboard and Pointer Event play, optional audio, mobile
            support, and Combine Mode remain available without an account.
          </p>
        </div>
        <LinkButton href="/play">Launch path</LinkButton>
      </section>

      <section className="access-panel" aria-labelledby="access-heading">
        <div>
          <p className="card-kicker">Default-deny policy</p>
          <h2 id="access-heading">Premium access</h2>
          <p>
            Browser state and prototype fixtures never grant product access.
            A future trusted server must verify identity and entitlement.
          </p>
        </div>
        <StatusBadge
          className="access-state"
          data-access={access.features["premium-game-modes"] ? "allowed" : "denied"}
          data-testid="premium-access-state"
        >
          {access.features["premium-game-modes"] ? "Available" : "Not available"}
        </StatusBadge>
      </section>
    </TeacherShell>
  );
}
