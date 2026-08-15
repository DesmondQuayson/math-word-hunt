"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef } from "react";

import {
  adminEnrollMfaAction,
  adminSignInAction,
  adminVerifyMfaAction
} from "@/app/admin/actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/forms/text-field";
import { initialAdminAuthFormState, type AdminAuthFormState } from "@/lib/admin/form-state";

function AdminFormMessage({ state }: { state: AdminAuthFormState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status === "error") ref.current?.focus(); }, [state.status]);
  if (state.status === "idle" || state.status === "enrollment") return null;
  return <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
    <strong>Access not granted.</strong><p>{state.message}</p>
  </div>;
}

export function AdminSignInForm({ csrfToken }: { csrfToken: string }) {
  const [state, action, pending] = useActionState(adminSignInAction, initialAdminAuthFormState);
  return <form className="prototype-form" action={action} noValidate>
    <AdminFormMessage state={state} />
    <input type="hidden" name="csrfToken" value={csrfToken} />
    <TextField id="admin-email" name="email" type="email" autoComplete="username" label="Owner email address" required />
    <TextField id="admin-password" name="password" type="password" autoComplete="current-password" label="Password" required />
    <div className="form-actions"><Button type="submit" loading={pending}>Continue securely</Button></div>
  </form>;
}

export function AdminAccountSwitch({ csrfToken, action }: { csrfToken: string; action: (formData: FormData) => void | Promise<void> }) {
  return <section className="admin-account-switch" aria-labelledby="admin-account-switch-title">
    <h1 id="admin-account-switch-title">Sign in to MathNexa Admin</h1>
    <p>You are currently signed in to MathNexa without Admin access. Sign out of this account to continue with the authorized owner account.</p>
    <div className="form-actions">
      <form action={action}><input type="hidden" name="csrfToken" value={csrfToken} /><Button type="submit">Sign out and continue</Button></form>
      <Link className="button button-secondary" href="/">Return to MathNexa</Link>
    </div>
  </section>;
}

function AdminVerifyForm({ csrfToken, factorId }: { csrfToken: string; factorId: string }) {
  const [state, action, pending] = useActionState(adminVerifyMfaAction, initialAdminAuthFormState);
  return <form className="prototype-form" action={action} noValidate>
    <AdminFormMessage state={state} />
    <input type="hidden" name="csrfToken" value={csrfToken} />
    <input type="hidden" name="factorId" value={factorId} />
    <TextField
      id="admin-totp-code"
      name="code"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      minLength={6}
      maxLength={6}
      label="Six-digit authenticator code"
      description="Enter the current code from the authenticator app registered to the owner account."
      required
    />
    <div className="form-actions"><Button type="submit" loading={pending}>Verify and open admin</Button></div>
  </form>;
}

export function AdminMfaFlow({ csrfToken, verifiedFactorId }: { csrfToken: string; verifiedFactorId?: string }) {
  const [enrollment, enrollAction, enrolling] = useActionState(adminEnrollMfaAction, initialAdminAuthFormState);
  const factorId = enrollment.status === "enrollment" ? enrollment.factorId : verifiedFactorId;
  const qrPayload = enrollment.qrCode?.slice((enrollment.qrCode.indexOf(",") ?? -1) + 1).trim();
  const qrSource = qrPayload ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrPayload)}` : undefined;

  return <div className="admin-mfa-flow">
    {!factorId ? <form className="prototype-form" action={enrollAction}>
      <AdminFormMessage state={enrollment} />
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <p>No verified TOTP authenticator is registered. Enrollment must finish before an admin session can start.</p>
      <div className="form-actions"><Button type="submit" loading={enrolling}>Set up authenticator</Button></div>
    </form> : null}

    {enrollment.status === "enrollment" && qrSource && enrollment.secret ? <section className="admin-enrollment" aria-labelledby="admin-enrollment-title">
      <h2 id="admin-enrollment-title">Register the authenticator</h2>
      <p>{enrollment.message}</p>
      <Image src={qrSource} alt="QR code for the owner authenticator enrollment" width={240} height={240} unoptimized />
      <p>If scanning is unavailable, enter this one-time setup key manually:</p>
      <code className="admin-setup-secret">{enrollment.secret}</code>
      <p className="form-field-note">This setup key is shown only for enrollment. Do not save it in logs, messages, or screenshots.</p>
    </section> : null}

    {factorId ? <AdminVerifyForm csrfToken={csrfToken} factorId={factorId} /> : null}
  </div>;
}
