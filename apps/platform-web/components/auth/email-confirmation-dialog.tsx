"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  checkEmailConfirmationAction,
  resendConfirmationAction
} from "@/app/auth-actions";
import { initialEmailConfirmationState, type EmailConfirmationState } from "@/lib/auth/form-state";

import { Button } from "../ui/button";

function ConfirmationStatus({
  status,
  message
}: Readonly<{ status: "idle" | "error" | "success"; message: string }>) {
  if (status === "idle") return null;
  return <p className={`confirmation-status confirmation-status-${status}`} role={status === "error" ? "alert" : "status"}>
    {message}
  </p>;
}

export function EmailConfirmationDialog({ maskedEmail }: Readonly<{ maskedEmail: string }>) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checkState, checkAction, checking] = useActionState(
    checkEmailConfirmationAction,
    initialEmailConfirmationState
  );
  const [cooldown, setCooldown] = useState(0);
  const [resendState, resendAction, resending] = useActionState(
    async (previous: EmailConfirmationState, formData: FormData) => {
      const result = await resendConfirmationAction(previous, formData);
      setCooldown(result.cooldownSeconds ?? 0);
      return result;
    },
    initialEmailConfirmationState
  );

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (checkState.status !== "success" || !checkState.destination) return;
    const timer = window.setTimeout(() => router.replace(checkState.destination ?? "/account"), 900);
    return () => window.clearTimeout(timer);
  }, [checkState.destination, checkState.status, router]);

  function closeDialog() {
    dialogRef.current?.close();
    setDismissed(true);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  function openDialog() {
    setDismissed(false);
    dialogRef.current?.showModal();
  }

  return <>
    <dialog
      className="confirmation-dialog"
      ref={dialogRef}
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-description"
      onCancel={() => setDismissed(true)}
      onClose={() => setDismissed(true)}
    >
      <div className="confirmation-dialog-panel">
        <div className="confirmation-mail-mark" aria-hidden="true">
          <span>✓</span>
        </div>
        <p className="eyebrow">One quick step</p>
        <h2 id="confirmation-dialog-title">Check your email</h2>
        <div id="confirmation-dialog-description" className="confirmation-dialog-copy">
          <p>We sent a confirmation link to <strong>{maskedEmail}</strong>. Open the email and select “Confirm email” to finish setting up your MathNexa account.</p>
          <p>Once your email is confirmed, return to MathNexa and continue where you left off.</p>
        </div>
        <ConfirmationStatus status={checkState.status} message={checkState.message} />
        {resendState.message ? <ConfirmationStatus status={resendState.status} message={resendState.message} /> : null}
        <div className="confirmation-dialog-actions">
          <form action={checkAction}>
            <Button type="submit" loading={checking}>I&apos;ve confirmed my email</Button>
          </form>
          <form action={resendAction}>
            <Button type="submit" variant="secondary" loading={resending} disabled={cooldown > 0}>
              {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend confirmation email"}
            </Button>
          </form>
          <button className="confirmation-text-action" type="button" onClick={closeDialog}>Continue browsing</button>
        </div>
      </div>
    </dialog>
    {dismissed ? <div className="confirmation-reopen" role="status">
      <span>Confirm your email to finish setting up MathNexa.</span>
      <button type="button" onClick={openDialog}>Open confirmation steps</button>
    </div> : null}
  </>;
}

export function ConfirmationReminder() {
  const [cooldown, setCooldown] = useState(0);
  const [resendState, resendAction, resending] = useActionState(
    async (previous: EmailConfirmationState, formData: FormData) => {
      const result = await resendConfirmationAction(previous, formData);
      setCooldown(result.cooldownSeconds ?? 0);
      return result;
    },
    initialEmailConfirmationState
  );
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  return <aside className="confirmation-reminder" aria-labelledby="confirmation-reminder-title">
    <div>
      <strong id="confirmation-reminder-title">Confirm your email to unlock MathNexa access.</strong>
      <p>Use the link in your confirmation email, then return to your selected resource.</p>
      {resendState.message ? <ConfirmationStatus status={resendState.status} message={resendState.message} /> : null}
    </div>
    <form action={resendAction}>
      <Button type="submit" variant="secondary" loading={resending} disabled={cooldown > 0}>
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
      </Button>
    </form>
    <Link href="/account">Review account</Link>
  </aside>;
}
