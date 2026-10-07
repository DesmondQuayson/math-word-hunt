"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  checkEmailConfirmationAction,
  resendConfirmationAction
} from "@/app/auth-actions";
import { POST_AUTH_DESTINATION } from "@/lib/auth/access-intent";
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

/**
 * The resend countdown. The button carries the per-second count; the status
 * line changes only when the wait starts and when it ends, so a screen reader
 * hears two calm announcements instead of sixty.
 */
function useResendCooldown(initialSeconds = 0) {
  const [cooldown, setCooldown] = useState(Math.max(0, Math.floor(initialSeconds)));
  const [announcement, setAnnouncement] = useState(cooldown > 0 ? `You can request another email in ${cooldown} seconds.` : "");
  const waiting = cooldown > 0;
  const previous = useRef(waiting);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);
  useEffect(() => {
    if (previous.current === waiting) return;
    previous.current = waiting;
    setAnnouncement(waiting ? `You can request another email in ${cooldown} seconds.` : "You can request another confirmation email now.");
  }, [waiting, cooldown]);
  return { cooldown, setCooldown, announcement };
}

function CooldownStatus({ id, announcement }: Readonly<{ id: string; announcement: string }>) {
  return <p id={id} className="confirmation-cooldown-status" role="status" aria-live="polite">{announcement}</p>;
}

export function EmailConfirmationDialog({ maskedEmail, initialCooldownSeconds = 0 }: Readonly<{ maskedEmail: string; initialCooldownSeconds?: number }>) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checkState, checkAction, checking] = useActionState(
    checkEmailConfirmationAction,
    initialEmailConfirmationState
  );
  const { cooldown, setCooldown, announcement } = useResendCooldown(initialCooldownSeconds);
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
    if (checkState.status !== "success" || !checkState.destination) return;
    const timer = window.setTimeout(() => router.replace(checkState.destination ?? POST_AUTH_DESTINATION), 900);
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
            <Button type="submit" variant="secondary" loading={resending} disabled={cooldown > 0} aria-describedby="confirmation-dialog-cooldown">
              {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend confirmation email"}
            </Button>
          </form>
          <CooldownStatus id="confirmation-dialog-cooldown" announcement={announcement} />
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
  const { cooldown, setCooldown, announcement } = useResendCooldown();
  const [resendState, resendAction, resending] = useActionState(
    async (previous: EmailConfirmationState, formData: FormData) => {
      const result = await resendConfirmationAction(previous, formData);
      setCooldown(result.cooldownSeconds ?? 0);
      return result;
    },
    initialEmailConfirmationState
  );
  return <aside className="confirmation-reminder" aria-labelledby="confirmation-reminder-title">
    <div>
      <strong id="confirmation-reminder-title">Confirm your email to unlock MathNexa access.</strong>
      <p>Use the link in your confirmation email, then return to your selected resource.</p>
      {resendState.message ? <ConfirmationStatus status={resendState.status} message={resendState.message} /> : null}
    </div>
    <form action={resendAction}>
      <Button type="submit" variant="secondary" loading={resending} disabled={cooldown > 0} aria-describedby="confirmation-reminder-cooldown">
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
      </Button>
    </form>
    <CooldownStatus id="confirmation-reminder-cooldown" announcement={announcement} />
    <Link href="/account">Review account</Link>
  </aside>;
}
