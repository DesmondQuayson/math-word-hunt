import { Notice } from "@/components/feedback/notice";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { WorkflowStepper } from "@/components/teacher/workflow-stepper";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

export const metadata = { title: "Session setup prototype" };

const steps = [
  { label: "Setup", description: "Choose class and activity" },
  { label: "Ready", description: "Check teams and display" },
  { label: "Active", description: "Future managed state" },
  { label: "Complete", description: "Future aggregate summary" }
] as const;

export default function NewSessionPage() {
  return (
    <TeacherShell currentPath="/teacher/sessions/new">
      <Breadcrumbs items={[
        { label: "Live Sessions", href: "/teacher/sessions" },
        { label: "Session setup prototype" }
      ]} />
      <PageHeader
        eyebrow="Workflow prototype · No realtime service"
        title="Prepare the room before the clock starts"
        description="The planned flow separates setup, launch readiness, recovery, and completion so a teacher always knows what is happening."
      />
      <WorkflowStepper steps={steps} currentStep={2} label="Managed session states" />

      <section className="ready-check" aria-labelledby="ready-check-heading">
        <div>
          <p className="card-kicker">Conceptual ready state</p>
          <h2 id="ready-check-heading">A future managed session would confirm</h2>
        </div>
        <ul>
          <li>Class context and teacher ownership</li>
          <li>Activity, lesson, time limit, and team count</li>
          <li>Shared display and recovery instructions</li>
          <li>No individual student account requirement</li>
        </ul>
      </section>

      <div className="session-boundary-grid">
        <Card variant="highlighted" className="session-boundary-card">
          <p className="card-kicker">Real action</p>
          <h2>Use the current classroom game</h2>
          <p>The v7 gateway is the only launch path that works in this phase.</p>
          <LinkButton href="/play">Open v7 gateway</LinkButton>
        </Card>
        <Card variant="muted" className="session-boundary-card">
          <p className="card-kicker">Unavailable action</p>
          <h2>Create managed session</h2>
          <p>Persistence, realtime state, reconnect, and completion records are not implemented.</p>
          <button className="button button-secondary" type="button" disabled aria-describedby="managed-session-disabled">
            Create managed session
          </button>
          <p id="managed-session-disabled" className="disabled-explanation">Unavailable until a trusted backend exists.</p>
        </Card>
      </div>

      <Notice label="Reconnect concept" tone="information">
        <strong>Future recovery must be explicit.</strong>
        <p>A reconnect screen would explain what is preserved, what is not, and how the teacher safely resumes or ends a session.</p>
      </Notice>
    </TeacherShell>
  );
}
