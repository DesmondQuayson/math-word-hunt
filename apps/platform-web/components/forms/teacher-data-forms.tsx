"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  createActivityAction,
  createClassAction,
  requestAccountDeletionAction,
  updateProfileAction
} from "@/app/teacher-actions";
import { ACTIVITY_CURRICULUM_OPTIONS } from "@/lib/adapters/curriculum-summary";
import { initialTeacherFormState, type TeacherFormState } from "@/lib/teacher/form-state";

import { Button } from "../ui/button";
import { SelectField, type SelectOption } from "./select-field";
import { TextField } from "./text-field";

function Result({ state, resultRef }: { state: TeacherFormState; resultRef: React.RefObject<HTMLDivElement | null> }) {
  if (state.status === "idle") return null;
  return <div className={state.status === "error" ? "error-summary" : "form-outcome"} role={state.status === "error" ? "alert" : "status"} tabIndex={state.status === "error" ? -1 : undefined} ref={resultRef}>
    <strong>{state.status === "error" ? "Check this form." : "Saved locally."}</strong><p>{state.message}</p>
  </div>;
}

function useResultFocus(state: TeacherFormState) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status === "error") ref.current?.focus(); }, [state]);
  return ref;
}

export function RealClassForm() {
  const [state, action, pending] = useActionState(createClassAction, initialTeacherFormState);
  const resultRef = useResultFocus(state);
  return <form className="prototype-form" action={action} noValidate>
    <Result state={state} resultRef={resultRef} />
    <TextField id="class-name" name="className" label="Class name" description="Use a teacher-recognizable label. Do not enter student names." required maxLength={80} error={state.fieldErrors?.className} />
    <SelectField id="class-grade" name="grade" label="Grade level" options={ACTIVITY_CURRICULUM_OPTIONS.grades} emptyLabel="No grade selected" error={state.fieldErrors?.grade} />
    <TextField id="class-section" name="section" label="Period or section" description="Optional. Examples: Period 2 or Block A." maxLength={40} error={state.fieldErrors?.periodOrSection} />
    <div className="form-actions"><Button type="submit" loading={pending}>Save class</Button><Link href="/teacher/classes">Cancel and return to classes</Link></div>
  </form>;
}

type ActivityFormProps = Readonly<{ classOptions: readonly SelectOption[] }>;
const timeOptions = [5, 10, 15, 20, 30, 45, 60].map((value) => ({ value: String(value), label: `${value} minutes` }));
const teamOptions = [2, 3, 4, 5, 6, 7, 8].map((value) => ({ value: String(value), label: `${value} teams` }));

export function RealActivityForm({ classOptions }: ActivityFormProps) {
  const [state, action, pending] = useActionState(createActivityAction, initialTeacherFormState);
  const resultRef = useResultFocus(state);
  return <form className="prototype-form" action={action} noValidate>
    <Result state={state} resultRef={resultRef} />
    <SelectField id="activity-class" name="classId" label="Class" description="Optional. Only your active classes are listed." options={classOptions} emptyLabel="No class selected" error={state.fieldErrors?.classId} />
    <SelectField id="activity-grade" name="grade" label="Grade" options={ACTIVITY_CURRICULUM_OPTIONS.grades} required error={state.fieldErrors?.grade} />
    <SelectField id="activity-topic" name="topic" label="Topic" options={ACTIVITY_CURRICULUM_OPTIONS.topics} required error={state.fieldErrors?.topicId} />
    <SelectField id="activity-lesson" name="lesson" label="Lesson" options={ACTIVITY_CURRICULUM_OPTIONS.lessons} required error={state.fieldErrors?.lessonId} />
    <div className="form-field"><span className="field-label">Game mode</span><p>Team vocabulary hunt is the only stored mode in Phase 1D.</p><input type="hidden" name="mode" value="team-hunt" /></div>
    <SelectField id="activity-time" name="timeLimit" label="Time limit" options={timeOptions} required error={state.fieldErrors?.timeLimitMinutes} />
    <SelectField id="activity-teams" name="teamCount" label="Team count" options={teamOptions} required error={state.fieldErrors?.teamCount} />
    <label className="checkbox-field" htmlFor="activity-combine"><input id="activity-combine" name="combineMode" type="checkbox" /><span><strong>Use Combine Mode</strong><small>Recommended when a lesson has fewer than four placeable terms.</small></span></label>
    <div className="form-actions"><Button type="submit" loading={pending}>Save activity draft</Button><Link href="/teacher/activities">Cancel and return to activities</Link></div>
  </form>;
}

export function ProfileForm({ displayName, schoolLabel }: { displayName: string; schoolLabel: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialTeacherFormState);
  const resultRef = useResultFocus(state);
  return <form className="prototype-form" action={action} noValidate>
    <Result state={state} resultRef={resultRef} />
    <TextField id="profile-display-name" name="displayName" label="Display name" defaultValue={displayName} required maxLength={80} />
    <TextField id="profile-school" name="schoolLabel" label="School or organization" defaultValue={schoolLabel} maxLength={120} description="Optional. Do not enter student information." />
    <Button type="submit" loading={pending}>Update profile</Button>
  </form>;
}

export function DeletionRequestForm() {
  const [state, action, pending] = useActionState(requestAccountDeletionAction, initialTeacherFormState);
  const resultRef = useResultFocus(state);
  return <form className="prototype-form" action={action}>
    <Result state={state} resultRef={resultRef} />
    <p>This records a request and restricts future writes. It does not permanently delete the account.</p>
    <Button type="submit" variant="danger" loading={pending}>Request account deletion</Button>
  </form>;
}
