"use client";

import { useId, useRef } from "react";

type Props = Readonly<{
  csrfToken: string; targetUserId: string; operation: string; idempotencyKey: string;
  label: string; description: string; reasonRequired?: boolean; danger?: boolean;
  durationDays?: boolean; refundRequestId?: string;
}>;

export function AdminOperationDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId();
  return <>
    <button className={props.danger ? "admin-danger-action" : "admin-secondary-action"} type="button" onClick={() => dialog.current?.showModal()}>{props.label}</button>
    <dialog ref={dialog} className="admin-operation-dialog" aria-labelledby={titleId}>
      <form action="/admin/users/action" method="post">
        <input type="hidden" name="csrfToken" value={props.csrfToken}/><input type="hidden" name="targetUserId" value={props.targetUserId}/>
        <input type="hidden" name="operation" value={props.operation}/><input type="hidden" name="idempotencyKey" value={props.idempotencyKey}/>
        {props.refundRequestId?<input type="hidden" name="refundRequestId" value={props.refundRequestId}/>:null}
        <p className="admin-eyebrow">Bounded server operation</p><h2 id={titleId}>{props.label}</h2><p>{props.description}</p>
        {props.reasonRequired?<label><span>Required reason</span><textarea name="reason" minLength={3} maxLength={500} required/><small>Do not enter passwords, tokens, payment details, student information, or other secrets.</small></label>:null}
        {props.durationDays?<label><span>Grant duration</span><select name="durationDays" defaultValue="7"><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>:null}
        <label className="admin-confirm-check"><input type="checkbox" required/><span>I confirm the named account and understand this operation is audited.</span></label>
        <div className="button-row"><button className={props.danger?"admin-danger-action":"admin-primary-action"} type="submit">Confirm {props.label.toLowerCase()}</button><button className="admin-secondary-action" type="button" onClick={() => dialog.current?.close()}>Go back</button></div>
      </form>
    </dialog>
  </>;
}
