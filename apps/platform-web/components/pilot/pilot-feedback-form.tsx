"use client";

import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { checkPilotText } from "@/lib/pilot/content-safety";

type FeedbackErrors = Partial<Record<"workflow" | "steps" | "expected" | "observed" | "accessibility", string>>;

function text(data: FormData, key: string): string {
  return String(data.get(key) ?? "");
}

export function PilotFeedbackForm() {
  const [errors, setErrors] = useState<FeedbackErrors>({});
  const [summary, setSummary] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = {
      workflow: checkPilotText(text(data, "workflow"), 120),
      steps: checkPilotText(text(data, "steps"), 1200),
      expected: checkPilotText(text(data, "expected"), 600),
      observed: checkPilotText(text(data, "observed"), 600),
      accessibility: checkPilotText(text(data, "accessibility"), 600)
    };
    const nextErrors: FeedbackErrors = {};
    for (const [key, result] of Object.entries(fields) as [keyof FeedbackErrors, typeof fields.workflow][]) {
      if (!result.safe) nextErrors[key] = `Remove ${result.category}. Do not include personal data or account secrets.`;
    }
    for (const key of ["workflow", "steps", "expected", "observed"] as const) {
      if (!fields[key].value) nextErrors[key] = "Complete this field without personal or student data.";
    }
    setErrors(nextErrors);
    setCopyStatus("");
    if (Object.keys(nextErrors).length > 0) {
      setSummary("");
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    const lines = [
      "Math Vocabulary Hunt pilot feedback",
      `Workflow: ${fields.workflow.value}`,
      `Approximate date/time: ${text(data, "occurredAt") || "Not provided"}`,
      `Device: ${text(data, "device") || "Not provided"}`,
      `Browser: ${text(data, "browser") || "Not provided"}`,
      `Impact: ${text(data, "impact") || "Not provided"}`,
      `Accessibility observation: ${fields.accessibility.value || "None provided"}`,
      `Steps: ${fields.steps.value}`,
      `Expected: ${fields.expected.value}`,
      `Observed: ${fields.observed.value}`
    ];
    setSummary(lines.join("\n"));
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus("Feedback summary copied. Send it only through the owner-approved pilot channel.");
    } catch {
      setCopyStatus("Copy was unavailable. Select the prepared summary and copy it manually.");
    }
  }

  return (
    <form className="prototype-form pilot-feedback-form" onSubmit={prepare} noValidate autoComplete="off">
      {Object.keys(errors).length ? (
        <div className="error-summary" role="alert" tabIndex={-1} ref={errorRef} data-testid="pilot-feedback-errors">
          <strong>Remove prohibited information and complete the required fields.</strong>
          <p>Do not include student data, email addresses, passwords, tokens, cookies, secrets, payment details, screenshots, or raw authentication content.</p>
        </div>
      ) : null}
      <div className="form-grid">
        <label className="form-field" htmlFor="feedback-workflow">
          <span className="field-label">Workflow being tested <span className="required-text">(required)</span></span>
          <small>Example: creating a class label or launching the game.</small>
          <input id="feedback-workflow" name="workflow" maxLength={120} aria-invalid={Boolean(errors.workflow)} aria-describedby={errors.workflow ? "feedback-workflow-error" : undefined} />
          {errors.workflow ? <span className="validation-message" id="feedback-workflow-error">{errors.workflow}</span> : null}
        </label>
        <label className="form-field" htmlFor="feedback-occurred">
          <span className="field-label">Approximate date and time</span>
          <small>Do not include an account email or identifier.</small>
          <input id="feedback-occurred" name="occurredAt" type="datetime-local" />
        </label>
        <label className="form-field" htmlFor="feedback-device">
          <span className="field-label">Device category</span>
          <select id="feedback-device" name="device" defaultValue="">
            <option value="">Choose a category</option><option>Phone</option><option>Tablet</option><option>Laptop or desktop</option><option>Smart Board or shared display</option>
          </select>
        </label>
        <label className="form-field" htmlFor="feedback-browser">
          <span className="field-label">Browser category</span>
          <select id="feedback-browser" name="browser" defaultValue="">
            <option value="">Choose a category</option><option>Chrome or Chromium</option><option>Edge</option><option>Firefox</option><option>Safari</option><option>Other or unknown</option>
          </select>
        </label>
        <label className="form-field" htmlFor="feedback-impact">
          <span className="field-label">Impact level</span>
          <select id="feedback-impact" name="impact" defaultValue="">
            <option value="">Choose an impact</option><option>Observation only</option><option>Slowed the workflow</option><option>Blocked the workflow</option><option>Possible privacy or security issue</option>
          </select>
        </label>
      </div>
      {([
        ["steps", "Reproducible steps", "Describe only the actions taken; use no names, emails, or classroom details.", 1200],
        ["expected", "Expected behavior", "Describe what you expected the product to do.", 600],
        ["observed", "Observed behavior", "Describe what happened without copying raw errors or account data.", 600],
        ["accessibility", "Accessibility observation", "Optional. Describe the interaction barrier, not the person using the product.", 600]
      ] as const).map(([name, label, description, maxLength]) => (
        <label className="form-field" htmlFor={`feedback-${name}`} key={name}>
          <span className="field-label">{label}{name !== "accessibility" ? <span className="required-text"> (required)</span> : null}</span>
          <small>{description}</small>
          <textarea id={`feedback-${name}`} name={name} rows={name === "steps" ? 6 : 4} maxLength={maxLength} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `feedback-${name}-error` : undefined} />
          {errors[name] ? <span className="validation-message" id={`feedback-${name}-error`}>{errors[name]}</span> : null}
        </label>
      ))}
      <div className="form-actions"><Button type="submit">Prepare feedback summary</Button></div>
      {summary ? <section className="feedback-summary" aria-labelledby="feedback-summary-heading"><h2 id="feedback-summary-heading">Prepared summary</h2><p>Nothing has been sent or saved. Review this text before sharing it through the approved pilot channel.</p><textarea aria-label="Prepared feedback summary" readOnly value={summary} rows={14} /><Button type="button" variant="secondary" onClick={copySummary}>Copy feedback summary</Button>{copyStatus ? <p role="status">{copyStatus}</p> : null}</section> : null}
    </form>
  );
}
