"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  forgotPasswordAction,
  signInAction,
  signUpAction,
  updatePasswordAction
} from "@/app/auth-actions";
import { EmailConfirmationDialog } from "@/components/auth/email-confirmation-dialog";
import { initialAuthFormState, type AuthFormState } from "@/lib/auth/form-state";

import { Button } from "../ui/button";
import { TextField } from "./text-field";

type AuthFormProps = Readonly<{ configured: boolean }>;
type SignUpFormProps = AuthFormProps & Readonly<{ consumerMode?: boolean; nextDestination?: string }>;
type SignInFormProps = AuthFormProps & Readonly<{ nextDestination?: string }>;

function FormMessage({ state, messageRef }: { state: AuthFormState; messageRef: React.RefObject<HTMLDivElement | null> }) {
  if (state.status === "idle") return null;
  return (
    <div
      className={state.status === "error" ? "error-summary" : "form-outcome"}
      role={state.status === "error" ? "alert" : "status"}
      tabIndex={state.status === "error" ? -1 : undefined}
      ref={messageRef}
    >
      <strong>{state.status === "error" ? "Check this form." : "Request received."}</strong>
      <p>{state.message}</p>
    </div>
  );
}

function useMessageFocus(state: AuthFormState) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  return ref;
}

export function SignUpForm({ configured, consumerMode = false, nextDestination }: SignUpFormProps) {
  const [state, action, pending] = useActionState(signUpAction, initialAuthFormState);
  const messageRef = useMessageFocus(state);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.confirmation) formRef.current?.reset();
  }, [state.confirmation]);
  return (
    <>
    <form className="prototype-form" action={action} noValidate ref={formRef}>
      {!state.confirmation ? <FormMessage state={state} messageRef={messageRef} /> : null}
      {nextDestination ? <input type="hidden" name="next" value={nextDestination} /> : null}
      <TextField id="signup-email" name="email" type="email" autoComplete="email" label="Email address" required error={state.fieldErrors?.email} />
      {!consumerMode ? <><TextField id="signup-display-name" name="displayName" autoComplete="name" label="Display name" description="Use the teacher name you want shown in the workspace." required maxLength={80} error={state.fieldErrors?.displayName} />
      <p className="form-field-note">Do not enter a school, district, classroom, institution, or organization name. Organization labels are disabled for this controlled pilot.</p></> : <p className="form-field-note">Only an email address and password are required.</p>}
      <TextField id="signup-password" name="password" type="password" autoComplete="new-password" label="Password" description="Use at least 8 characters with a letter and number." required error={state.fieldErrors?.password} />
      <TextField id="signup-password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" label="Confirm password" required error={state.fieldErrors?.passwordConfirmation} />
      <div className="form-actions"><Button type="submit" loading={pending} disabled={!configured}>{consumerMode ? "Create account" : "Create teacher account"}</Button><Link href="/sign-in">Already have an account?</Link></div>
    </form>
    {state.confirmation ? <EmailConfirmationDialog maskedEmail={state.confirmation.maskedEmail} /> : null}
    </>
  );
}

export function SignInForm({ configured, nextDestination }: SignInFormProps) {
  const [state, action, pending] = useActionState(signInAction, initialAuthFormState);
  const messageRef = useMessageFocus(state);
  return (
    <form className="prototype-form" action={action} noValidate>
      <FormMessage state={state} messageRef={messageRef} />
      {nextDestination ? <input type="hidden" name="next" value={nextDestination} /> : null}
      <TextField id="signin-email" name="email" type="email" autoComplete="email" label="Email address" required />
      <TextField id="signin-password" name="password" type="password" autoComplete="current-password" label="Password" required />
      <div className="form-actions"><Button type="submit" loading={pending} disabled={!configured}>Sign in</Button><Link href="/forgot-password">Forgot password?</Link></div>
    </form>
  );
}

export function ForgotPasswordForm({ configured }: AuthFormProps) {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialAuthFormState);
  const messageRef = useMessageFocus(state);
  return (
    <form className="prototype-form" action={action} noValidate>
      <FormMessage state={state} messageRef={messageRef} />
      <TextField id="recovery-email" name="email" type="email" autoComplete="email" label="Email address" required error={state.fieldErrors?.email} />
      <div className="form-actions"><Button type="submit" loading={pending} disabled={!configured}>Send recovery message</Button><Link href="/sign-in">Return to sign in</Link></div>
    </form>
  );
}

export function UpdatePasswordForm({ configured }: AuthFormProps) {
  const [state, action, pending] = useActionState(updatePasswordAction, initialAuthFormState);
  const messageRef = useMessageFocus(state);
  return (
    <form className="prototype-form" action={action} noValidate>
      <FormMessage state={state} messageRef={messageRef} />
      <TextField id="new-password" name="password" type="password" autoComplete="new-password" label="New password" description="Use at least 8 characters with a letter and number." required error={state.fieldErrors?.password} />
      <TextField id="new-password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" label="Confirm new password" required error={state.fieldErrors?.passwordConfirmation} />
      <div className="form-actions"><Button type="submit" loading={pending} disabled={!configured}>Update password</Button><Link href="/forgot-password">Request a new recovery message</Link></div>
    </form>
  );
}
