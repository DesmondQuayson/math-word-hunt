"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { SelectField } from "./select-field";
import { TextField } from "./text-field";

type ClassFormErrors = {
  className?: string;
};

const gradeOptions = [
  { value: "6", label: "Grade 6" },
  { value: "7", label: "Grade 7" },
  { value: "8", label: "Grade 8" }
] as const;

export function ClassFormPrototype() {
  const [errors, setErrors] = useState<ClassFormErrors>({});
  const [notSaved, setNotSaved] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Object.keys(errors).length > 0) errorSummaryRef.current?.focus();
  }, [errors]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const className = String(formData.get("className") ?? "").trim();
    const nextErrors: ClassFormErrors = {};

    if (className.length === 0) {
      nextErrors.className = "Enter a class name.";
    } else if (className.length < 2) {
      nextErrors.className = "Class name must contain at least 2 characters.";
    } else if (className.length > 80) {
      nextErrors.className = "Class name must contain no more than 80 characters.";
    }

    setErrors(nextErrors);
    setNotSaved(Object.keys(nextErrors).length === 0);
  }

  return (
    <form className="prototype-form" noValidate onSubmit={handleSubmit} data-testid="class-form">
      {Object.keys(errors).length > 0 ? (
        <div
          className="error-summary"
          role="alert"
          tabIndex={-1}
          ref={errorSummaryRef}
          data-testid="error-summary"
        >
          <strong>Check the class information.</strong>
          <a href="#class-name">Class name needs attention.</a>
        </div>
      ) : null}

      {notSaved ? (
        <div className="form-outcome" role="status">
          <strong>Nothing was saved.</strong>
          <p>Saving classes is unavailable in this preview.</p>
        </div>
      ) : null}

      <TextField
        id="class-name"
        name="className"
        label="Class name"
        description="Use a teacher-recognizable label. Do not enter student names."
        required
        maxLength={80}
        error={errors.className}
      />
      <SelectField
        id="class-grade"
        name="grade"
        label="Grade level"
        description="Optional. A future class may cover more than one grade."
        options={gradeOptions}
        emptyLabel="No grade selected"
      />
      <TextField
        id="class-section"
        name="section"
        label="Period or section"
        description="Optional. Examples: Period 2 or Block A."
        maxLength={40}
      />

      <div className="form-actions">
        <Button type="submit">Check class setup</Button>
        <Link href="/teacher/classes">Cancel and return to classes</Link>
      </div>
    </form>
  );
}
