"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

/**
 * A native POST form for an admin mutation that can only be submitted once:
 * the first submission disables the button and shows a pending label, and any
 * further submit event is cancelled. Server-side checks (session-bound CSRF,
 * version checks, idempotency) remain the authority.
 */
export function AdminGuardedForm({ action, className, submitLabel, submitClassName, pendingLabel = "Processing…", children }: Readonly<{
  action: string;
  className?: string;
  submitLabel: string;
  submitClassName: string;
  pendingLabel?: string;
  children: ReactNode;
}>) {
  const submitted = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) { submitted.current = false; setSubmitting(false); } };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitted.current) { event.preventDefault(); return; }
    submitted.current = true;
    setSubmitting(true);
  };

  return <form method="post" action={action} className={className} onSubmit={onSubmit} aria-busy={submitting}>
    {children}
    <button className={submitClassName} type="submit" disabled={submitting}>{submitting ? pendingLabel : submitLabel}</button>
  </form>;
}
