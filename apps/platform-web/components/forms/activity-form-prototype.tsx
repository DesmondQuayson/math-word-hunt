"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { ACTIVITY_CURRICULUM_OPTIONS } from "@/lib/adapters/curriculum-summary";

import { SelectField } from "./select-field";
import { TextField } from "./text-field";

type ActivityFormErrors = Readonly<Record<string, string>>;

const modeOptions = [
  { value: "team-hunt", label: "Team vocabulary hunt" },
  { value: "practice", label: "Whole-class practice" },
  { value: "review", label: "Vocabulary review" }
] as const;

const teamOptions = [2, 3, 4, 5, 6, 7, 8].map((teams) => ({
  value: String(teams),
  label: `${teams} teams`
}));

export function ActivityFormPrototype() {
  const [errors, setErrors] = useState<ActivityFormErrors>({});
  const [notSaved, setNotSaved] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Object.keys(errors).length > 0) errorSummaryRef.current?.focus();
  }, [errors]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextErrors: Record<string, string> = {};
    const requiredFields = {
      grade: "grade",
      topic: "topic",
      lesson: "lesson",
      mode: "game mode",
      teams: "team count"
    } as const;
    for (const [field, label] of Object.entries(requiredFields)) {
      if (!String(formData.get(field) ?? "")) {
        nextErrors[field] = `Choose a ${label}.`;
      }
    }

    const timeLimit = Number(formData.get("timeLimit"));
    if (!Number.isFinite(timeLimit) || timeLimit < 1 || timeLimit > 60) {
      nextErrors.timeLimit = "Enter a time limit from 1 to 60 minutes.";
    }

    setErrors(nextErrors);
    setNotSaved(Object.keys(nextErrors).length === 0);
  }

  return (
    <form className="prototype-form" noValidate onSubmit={handleSubmit} data-testid="activity-form">
      {Object.keys(errors).length > 0 ? (
        <div
          className="error-summary"
          role="alert"
          tabIndex={-1}
          ref={errorSummaryRef}
          data-testid="error-summary"
        >
          <strong>Choose the required activity settings.</strong>
          <ul>
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}><a href={`#activity-${field}`}>{message}</a></li>
            ))}
          </ul>
        </div>
      ) : null}

      {notSaved ? (
        <div className="form-outcome" role="status">
          <strong>Nothing was assigned or saved.</strong>
          <p>This prototype only validates the planned activity workflow.</p>
        </div>
      ) : null}

      <div className="form-grid">
        <SelectField
          id="activity-grade"
          name="grade"
          label="Grade"
          options={ACTIVITY_CURRICULUM_OPTIONS.grades}
          required
          error={errors.grade}
        />
        <SelectField
          id="activity-topic"
          name="topic"
          label="Topic"
          options={ACTIVITY_CURRICULUM_OPTIONS.topics}
          required
          error={errors.topic}
        />
        <SelectField
          id="activity-lesson"
          name="lesson"
          label="Lesson"
          options={ACTIVITY_CURRICULUM_OPTIONS.lessons}
          required
          error={errors.lesson}
        />
        <SelectField
          id="activity-mode"
          name="mode"
          label="Game mode"
          options={modeOptions}
          required
          error={errors.mode}
        />
        <TextField
          id="activity-timeLimit"
          name="timeLimit"
          label="Time limit in minutes"
          type="number"
          min={1}
          max={60}
          defaultValue={15}
          required
          error={errors.timeLimit}
        />
        <SelectField
          id="activity-teams"
          name="teams"
          label="Team count"
          options={teamOptions}
          required
          error={errors.teams}
        />
      </div>

      <label className="checkbox-field" htmlFor="activity-combine">
        <input id="activity-combine" name="combineMode" type="checkbox" />
        <span>
          <strong>Use Combine Mode</strong>
          <small>Recommended when a lesson has fewer than four placeable terms.</small>
        </span>
      </label>

      <div className="form-actions">
        <Button type="submit">Check activity setup</Button>
        <Link href="/teacher/activities">Cancel and return to activities</Link>
      </div>
    </form>
  );
}
