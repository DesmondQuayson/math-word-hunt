"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

type Props = Readonly<{
  csrfToken: string; targetUserId: string; operation: string; idempotencyKey: string;
  label: string; description: string; reasonRequired?: boolean; danger?: boolean;
  durationDays?: boolean; refundRequestId?: string;
  /** The operation needs a fresh authenticator code (the last verification is older than the step-up window). */
  stepUpRequired?: boolean;
}>;

/**
 * Confirmation for a bounded account operation. The first submission locks
 * the dialog ("Processing…") so a double click or an impatient second click
 * cannot send the operation twice; the server independently refuses to run a
 * repeated idempotency key again.
 */
export function AdminOperationDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId(); const codeId = useId();
  const submitted = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Returning with the browser's Back button restores this page from the
    // back/forward cache; the dialog must be usable again (with a fresh page
    // the idempotency key is new anyway).
    const restore = (event: PageTransitionEvent) => { if (event.persisted) { submitted.current = false; setSubmitting(false); } };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitted.current) { event.preventDefault(); return; }
    submitted.current = true;
    setSubmitting(true);
  };

  return <>
    <button className={props.danger ? "admin-danger-action" : "admin-secondary-action"} type="button" onClick={() => dialog.current?.showModal()}>{props.label}</button>
    <dialog ref={dialog} className="admin-operation-dialog" aria-labelledby={titleId} onCancel={(event) => { if (submitted.current) event.preventDefault(); }}>
      <form action="/admin/users/action" method="post" onSubmit={onSubmit} aria-busy={submitting}>
        <input type="hidden" name="csrfToken" value={props.csrfToken}/><input type="hidden" name="targetUserId" value={props.targetUserId}/>
        <input type="hidden" name="operation" value={props.operation}/><input type="hidden" name="idempotencyKey" value={props.idempotencyKey}/>
        {props.refundRequestId?<input type="hidden" name="refundRequestId" value={props.refundRequestId}/>:null}
        <p className="admin-eyebrow">Bounded server operation</p><h2 id={titleId}>{props.label}</h2><p>{props.description}</p>
        {props.reasonRequired?<label><span>Required reason</span><textarea name="reason" minLength={3} maxLength={500} required/><small>Do not enter passwords, tokens, payment details, student information, or other secrets.</small></label>:null}
        {props.durationDays?<label><span>Grant duration</span><select name="durationDays" defaultValue="7"><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>:null}
        {props.stepUpRequired?<div className="admin-step-up"><label htmlFor={codeId}>Authenticator code</label><input id={codeId} name="stepUpCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required aria-describedby={`${codeId}-hint`}/><small id={`${codeId}-hint`}>This action needs a fresh verification. Enter the current 6-digit code from your authenticator app.</small></div>:null}
        <label className="admin-confirm-check"><input type="checkbox" required/><span>I confirm the named account and understand this operation is audited.</span></label>
        <div className="button-row">
          <button className={props.danger?"admin-danger-action":"admin-primary-action"} type="submit" disabled={submitting}>{submitting ? "Processing…" : `Confirm ${props.label.toLowerCase()}`}</button>
          <button className="admin-secondary-action" type="button" disabled={submitting} onClick={() => dialog.current?.close()}>Go back</button>
        </div>
        <p className="visually-hidden" role="status" aria-live="polite">{submitting ? "Processing. Do not submit again." : ""}</p>
      </form>
    </dialog>
  </>;
}
