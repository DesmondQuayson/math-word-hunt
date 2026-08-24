"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  authorizeSchoolAccessAction
} from "@/app/school-access-actions";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { initialAuthorizedCodeFormState } from "@/lib/school-access/form-state";

export function AuthorizedCodeForm({ nextDestination }: Readonly<{ nextDestination: string }>) {
  const [state, action, pending] = useActionState(authorizeSchoolAccessAction, initialAuthorizedCodeFormState);
  const messageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") messageRef.current?.focus();
  }, [state.status]);

  return <section className="authorized-access-panel" aria-labelledby="authorized-access-heading">
    <div className="authorized-access-divider" aria-hidden="true"><span>School access</span></div>
    <div className="authorized-access-copy">
      <p className="eyebrow">Authorized staff access</p>
      <h2 id="authorized-access-heading">Enter authorized code to sign in</h2>
      <p>Use the code provided by your school. No personal account is created.</p>
    </div>
    <form className="authorized-access-form" action={action} noValidate>
      {state.status === "error" ? <div className="error-summary" role="alert" tabIndex={-1} ref={messageRef}>
        <strong>Code not accepted.</strong><p>{state.message}</p>
      </div> : null}
      <input type="hidden" name="next" value={nextDestination} />
      <TextField
        id="authorized-code"
        name="authorizedCode"
        type="password"
        autoComplete="off"
        label="Authorized code"
        maxLength={128}
        required
      />
      <Button type="submit" variant="secondary" loading={pending}>Continue</Button>
    </form>
  </section>;
}
