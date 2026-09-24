"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  forgotPasswordAction,
  signInAction,
  signUpAction,
  updatePasswordAction
} from "@/app/auth-actions";
import { EmailConfirmationDialog } from "@/components/auth/email-confirmation-dialog";
import {
  confirmationError,
  currentPasswordError,
  emailError,
  newPasswordError,
  type AccountFieldErrors
} from "@/lib/auth/field-validation";
import { initialAuthFormState, type AuthFormState } from "@/lib/auth/form-state";

import { Button } from "../ui/button";
import { PasswordField } from "./password-field";
import { TextField } from "./text-field";

type AuthFormProps = Readonly<{ configured: boolean }>;
type SignUpFormProps = AuthFormProps & Readonly<{
  consumerMode?: boolean;
  nextDestination?: string;
  /**
   * The free-trial onboarding layout: the plan summary (rendered by the page
   * from the approved commercial policy) sits between the account fields and
   * the call to action. Account creation itself is unchanged.
   */
  trial?: Readonly<{ planSummary: ReactNode; signInHref: string }>;
}>;
type SignInFormProps = AuthFormProps & Readonly<{ nextDestination?: string; signUpHref?: string; consumerMode?: boolean }>;

function FormMessage({ state, messageRef }: { state: AuthFormState; messageRef: React.RefObject<HTMLDivElement | null> }) {
  if (state.status === "idle") return null;
  return (
    <div
      className={state.status === "error" ? "error-summary" : "form-outcome"}
      role={state.status === "error" ? "alert" : "status"}
      tabIndex={state.status === "error" ? -1 : undefined}
      ref={messageRef}
    >
      <strong>{state.status === "error" ? "Please check the details below." : "Request received."}</strong>
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

function fieldValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : "";
}

/**
 * Browser-side presence/format checks with messages beside each field. A
 * failing check stops the submission before any request is made and moves
 * focus to the first field that needs attention; a passing one lets the
 * unchanged server action run, which validates everything again.
 */
function useFieldErrors(validate: (form: HTMLFormElement) => AccountFieldErrors, enabled = true) {
  const [errors, setErrors] = useState<AccountFieldErrors>({});
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!enabled) return;
    const next = validate(event.currentTarget);
    setErrors(next);
    const first = (Object.keys(next) as (keyof AccountFieldErrors)[]).find((name) => next[name]);
    if (!first) return;
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem(first);
    if (field instanceof HTMLInputElement) field.focus();
  };
  const onInput = (event: FormEvent<HTMLFormElement>) => {
    const name = (event.target as HTMLInputElement).name as keyof AccountFieldErrors;
    if (errors[name]) setErrors((previous) => ({ ...previous, [name]: undefined }));
  };
  return { errors, onSubmit, onInput };
}

export function SignUpForm({ configured, consumerMode = false, nextDestination, trial }: SignUpFormProps) {
  const [state, action, pending] = useActionState(signUpAction, initialAuthFormState);
  const messageRef = useMessageFocus(state);
  const formRef = useRef<HTMLFormElement>(null);
  const { errors, onSubmit, onInput } = useFieldErrors((form) => {
    const password = fieldValue(form, "password");
    return {
      email: emailError(fieldValue(form, "email")),
      password: newPasswordError(password),
      passwordConfirmation: confirmationError(password, fieldValue(form, "passwordConfirmation"))
    };
  }, consumerMode);
  useEffect(() => {
    if (state.confirmation) formRef.current?.reset();
  }, [state.confirmation]);
  const accountFields = <>
    <TextField id="signup-email" name="email" type="email" autoComplete="email" inputMode="email" label="Email address" required error={errors.email ?? state.fieldErrors?.email} />
    {!consumerMode ? <><TextField id="signup-display-name" name="displayName" autoComplete="name" label="Display name" description="Use the teacher name you want shown in the workspace." required maxLength={80} error={state.fieldErrors?.displayName} />
    <p className="form-field-note">Do not enter a school, district, classroom, institution, or organization name. Organization labels are disabled for this controlled pilot.</p></> : trial ? null : <p className="form-field-note">Only an email address and password are required.</p>}
    <PasswordField id="signup-password" name="password" autoComplete="new-password" label="Password" description="Use at least 8 characters with a letter and number." required error={errors.password ?? state.fieldErrors?.password} />
    <PasswordField id="signup-password-confirmation" name="passwordConfirmation" autoComplete="new-password" label="Confirm password" required error={errors.passwordConfirmation ?? state.fieldErrors?.passwordConfirmation} />
  </>;
  const submitLabel = pending
    ? "Creating your account…"
    : trial ? "Start free trial" : consumerMode ? "Create account" : "Create teacher account";
  return (
    <>
    <form className={`prototype-form${trial ? " account-form account-form--trial" : ""}`} action={action} onSubmit={onSubmit} onInput={onInput} noValidate ref={formRef}>
      {!state.confirmation ? <FormMessage state={state} messageRef={messageRef} /> : null}
      {nextDestination ? <input type="hidden" name="next" value={nextDestination} /> : null}
      {trial ? <fieldset className="form-section">
        <legend>Account</legend>
        {accountFields}
      </fieldset> : accountFields}
      {trial ? trial.planSummary : null}
      {trial ? <div className="form-actions form-actions--primary">
        <Button type="submit" className="button-large" loading={pending} disabled={!configured}>{submitLabel}</Button>
        <p className="form-footnote">Next, confirm your email. Then add a payment method on Stripe&apos;s secure checkout to begin the trial.</p>
        <p className="form-switch">Already have an account? <Link href={trial.signInHref}>Sign in</Link></p>
      </div> : <div className="form-actions"><Button type="submit" loading={pending} disabled={!configured}>{submitLabel}</Button><Link href="/sign-in">Already have an account?</Link></div>}
    </form>
    {state.confirmation ? <EmailConfirmationDialog maskedEmail={state.confirmation.maskedEmail} /> : null}
    </>
  );
}

export function SignInForm({ configured, nextDestination, signUpHref, consumerMode = false }: SignInFormProps) {
  const [state, action, pending] = useActionState(signInAction, initialAuthFormState);
  const messageRef = useMessageFocus(state);
  const { errors, onSubmit, onInput } = useFieldErrors((form) => ({
    email: emailError(fieldValue(form, "email")),
    password: currentPasswordError(fieldValue(form, "password"))
  }), consumerMode);
  return (
    <form className="prototype-form account-form" action={action} onSubmit={onSubmit} onInput={onInput} noValidate>
      <FormMessage state={state} messageRef={messageRef} />
      {nextDestination ? <input type="hidden" name="next" value={nextDestination} /> : null}
      <TextField id="signin-email" name="email" type="email" autoComplete="email" inputMode="email" label="Email address" required error={errors.email} />
      <PasswordField id="signin-password" name="password" autoComplete="current-password" label="Password" required error={errors.password} />
      <div className="form-actions"><Button type="submit" loading={pending} disabled={!configured}>{pending ? "Signing in…" : "Sign in"}</Button><Link href="/forgot-password">Forgot password?</Link></div>
      {signUpHref ? <p className="form-switch">New to MathNexa? <Link href={signUpHref}>Start free trial</Link></p> : null}
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
  const { errors, onSubmit, onInput } = useFieldErrors((form) => {
    const password = fieldValue(form, "password");
    return {
      password: newPasswordError(password),
      passwordConfirmation: confirmationError(password, fieldValue(form, "passwordConfirmation"))
    };
  });
  return (
    <form className="prototype-form account-form" action={action} onSubmit={onSubmit} onInput={onInput} noValidate>
      <FormMessage state={state} messageRef={messageRef} />
      <PasswordField id="new-password" name="password" autoComplete="new-password" label="New password" description="Use at least 8 characters with a letter and number." required error={errors.password ?? state.fieldErrors?.password} />
      <PasswordField id="new-password-confirmation" name="passwordConfirmation" autoComplete="new-password" label="Confirm new password" required error={errors.passwordConfirmation ?? state.fieldErrors?.passwordConfirmation} />
      <div className="form-actions"><Button type="submit" loading={pending} disabled={!configured}>{pending ? "Updating password…" : "Update password"}</Button><Link href="/forgot-password">Request a new recovery message</Link></div>
    </form>
  );
}
