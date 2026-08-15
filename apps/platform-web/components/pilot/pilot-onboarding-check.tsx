"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

export function PilotOnboardingCheck() {
  const [message, setMessage] = useState<string | null>(null);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const understood = new FormData(event.currentTarget).get("pilot-boundaries") === "on";
    setMessage(
      understood
        ? "Boundary review complete for this page. Nothing was saved, and pilot access remains inactive."
        : "Confirm that you understand the adult-teacher-only and no-student-data boundaries."
    );
  }

  return (
    <form className="pilot-acknowledgment" onSubmit={review} noValidate>
      <label className="checkbox-field" htmlFor="pilot-boundaries">
        <input id="pilot-boundaries" name="pilot-boundaries" type="checkbox" />
        <span>
          <strong>I understand the pilot boundaries.</strong>
          <small>This is a readiness check, not legal consent. The selection is not saved.</small>
        </span>
      </label>
      <Button type="submit">Review my understanding</Button>
      {message ? <p className="pilot-inline-status" role="status">{message}</p> : null}
    </form>
  );
}
