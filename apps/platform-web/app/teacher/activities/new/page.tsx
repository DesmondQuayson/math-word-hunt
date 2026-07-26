import { ActivityFormPrototype } from "@/components/forms/activity-form-prototype";
import { Notice } from "@/components/feedback/notice";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { WorkflowStepper } from "@/components/teacher/workflow-stepper";

export const metadata = { title: "Create activity prototype" };

const steps = [
  { label: "Content", description: "Grade, topic, lesson" },
  { label: "Play", description: "Mode, time, teams" },
  { label: "Review", description: "Check before a future save" }
] as const;

export default function NewActivityPage() {
  return (
    <TeacherShell currentPath="/teacher/activities/new">
      <Breadcrumbs items={[
        { label: "Activities", href: "/teacher/activities" },
        { label: "Create activity prototype" }
      ]} />
      <PageHeader
        eyebrow="Workflow prototype · No assignment delivery"
        title="Shape a vocabulary activity"
        description="Choose the content and classroom constraints a teacher needs under time pressure. Validation works; saving and assignment delivery do not."
      />
      <WorkflowStepper steps={steps} currentStep={1} label="Activity authoring steps" />
      <Notice label="Curriculum selection guidance" tone="information">
        <strong>Thin lessons need a fuller word pool.</strong>
        <p>Choose Combine Mode when a lesson has fewer than four placeable terms.</p>
      </Notice>
      <ActivityFormPrototype />
    </TeacherShell>
  );
}
