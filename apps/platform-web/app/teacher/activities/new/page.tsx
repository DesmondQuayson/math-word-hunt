import { ActivityFormPrototype } from "@/components/forms/activity-form-prototype";
import { Notice } from "@/components/feedback/notice";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { WorkflowStepper } from "@/components/teacher/workflow-stepper";

export const metadata = { title: "Plan an activity" };

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
        { label: "Plan an activity" }
      ]} />
      <PageHeader
        eyebrow="Planning preview · Saving unavailable"
        title="Shape a vocabulary activity"
        description="Choose the content, time, and team settings you would need before class. You can check the form, but you cannot save or assign the activity."
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
