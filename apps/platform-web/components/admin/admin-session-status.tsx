"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ADMIN_SESSION_MAX_MINUTES, ADMIN_SESSION_WARNING_MINUTES } from "@/lib/admin/session-policy";

/**
 * The Super Admin session countdown. It is informational only: the server
 * decides on every request whether the session is still valid, and nothing
 * here extends it automatically. The only way to push back the idle deadline
 * is the explicit "Stay signed in" button, which is itself an admin request;
 * the absolute 2-hour deadline never moves.
 */
export type AdminSessionTiming = Readonly<{
  absoluteExpiresAt: string;
  idleExpiresAt: string;
  serverNow: string;
}>;

export type AdminSessionPhase = "active" | "warning" | "ended";

const MINUTE = 60_000;
const TICK_MILLISECONDS = 15_000;

export function formatSessionRemaining(milliseconds: number): string {
  const minutes = Math.max(0, Math.ceil(milliseconds / MINUTE));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function minutesText(milliseconds: number): string {
  const minutes = Math.max(1, Math.ceil(milliseconds / MINUTE));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export type AdminSessionCountdown = Readonly<{
  enabled: boolean;
  phase: AdminSessionPhase;
  endsBy: "absolute" | "idle";
  /** Until the session ends if nothing happens: the earlier of the absolute and idle deadlines. */
  remaining: number;
  /** Until the fixed absolute limit: what the clock shows. */
  absoluteRemaining: number;
  announcement: string;
  extending: boolean;
  staySignedIn: () => void;
}>;

export function useAdminSessionCountdown(timing: AdminSessionTiming | null | undefined, csrfToken: string): AdminSessionCountdown {
  const [deadlines, setDeadlines] = useState(() => ({
    absolute: timing ? Date.parse(timing.absoluteExpiresAt) : Number.POSITIVE_INFINITY,
    idle: timing ? Date.parse(timing.idleExpiresAt) : Number.POSITIVE_INFINITY
  }));
  // Starts from the server's clock so the first client render matches the
  // server render; the effect then follows the browser clock, corrected by the
  // measured offset.
  const [now, setNow] = useState(() => (timing ? Date.parse(timing.serverNow) : 0));
  const offset = useRef(0);
  // The live-region text and the phase it was written for. It changes only when
  // the phase changes (or after an explicit action), never on a clock tick.
  const [announced, setAnnounced] = useState<Readonly<{ phase: AdminSessionPhase; text: string }>>({ phase: "active", text: "" });
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    if (!timing) return;
    offset.current = Date.parse(timing.serverNow) - Date.now();
    const tick = () => setNow(Date.now() + offset.current);
    tick();
    const interval = window.setInterval(tick, TICK_MILLISECONDS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timing]);

  const effective = Math.min(deadlines.absolute, deadlines.idle);
  const endsBy: "absolute" | "idle" = deadlines.idle < deadlines.absolute ? "idle" : "absolute";
  const remaining = effective - now;
  const phase: AdminSessionPhase = !timing ? "active"
    : !Number.isFinite(remaining) || remaining <= 0 ? "ended"
      : remaining <= ADMIN_SESSION_WARNING_MINUTES * MINUTE ? "warning" : "active";

  // One polite announcement per threshold, never one per tick: the text is
  // replaced only when the phase changes (React's "adjust state when a value
  // changes" pattern, during render rather than in an effect).
  if (timing && announced.phase !== phase) {
    setAnnounced({
      phase,
      text: phase === "warning"
        ? endsBy === "idle"
          ? `Your Super Admin session will end in ${minutesText(remaining)} because of inactivity.`
          : `Your Super Admin session expires in ${minutesText(remaining)}.`
        : phase === "ended" ? "Your Super Admin session has ended. Sign in again to continue." : announced.text
    });
  }

  const staySignedIn = useCallback(() => {
    if (extending) return;
    setExtending(true);
    const body = new FormData();
    body.set("csrfToken", csrfToken);
    fetch("/admin/session/activity", { method: "POST", body, credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setDeadlines((current) => ({ ...current, idle: 0 }));
          return;
        }
        const data = await response.json() as { absoluteExpiresAt: string; idleExpiresAt: string; serverNow: string };
        offset.current = Date.parse(data.serverNow) - Date.now();
        const next = { absolute: Date.parse(data.absoluteExpiresAt), idle: Date.parse(data.idleExpiresAt) };
        const nextNow = Date.now() + offset.current;
        const nextRemaining = Math.min(next.absolute, next.idle) - nextNow;
        setDeadlines(next);
        setNow(nextNow);
        setAnnounced({
          phase: nextRemaining <= 0 ? "ended" : nextRemaining <= ADMIN_SESSION_WARNING_MINUTES * MINUTE ? "warning" : "active",
          text: `Session kept active. It still ends at the ${ADMIN_SESSION_MAX_MINUTES / 60}-hour limit.`
        });
      })
      .catch(() => setAnnounced((current) => ({ ...current, text: "The session could not be kept active. Check your connection and try again." })))
      .finally(() => setExtending(false));
  }, [csrfToken, extending]);

  return { enabled: Boolean(timing), phase, endsBy, remaining, absoluteRemaining: deadlines.absolute - now, announcement: announced.text, extending, staySignedIn };
}

/**
 * Shows the time left before the fixed 2-hour limit. The idle timeout is
 * reset by every admin request, so it is announced only when it is close
 * (see AdminSessionNotice) rather than shown as the session length.
 */
export function AdminSessionClock({ countdown }: Readonly<{ countdown: AdminSessionCountdown }>) {
  if (!countdown.enabled) return null;
  return <p className="admin-session-clock" data-phase={countdown.phase}>
    <span className="admin-session-clock-label">Session</span>
    <strong>{countdown.phase === "ended" ? "Ended" : `${formatSessionRemaining(countdown.absoluteRemaining)} remaining`}</strong>
  </p>;
}

export function AdminSessionNotice({ countdown, signInHref }: Readonly<{ countdown: AdminSessionCountdown; signInHref: string }>) {
  if (!countdown.enabled) return null;
  const idle = countdown.endsBy === "idle";
  return <>
    <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{countdown.announcement}</p>
    {countdown.phase === "warning" ? <div className="admin-session-warning" data-ends-by={countdown.endsBy}>
      <p>
        <strong>{idle
          ? `Your Super Admin session will end in ${minutesText(countdown.remaining)} because of inactivity.`
          : `Your Super Admin session expires in ${minutesText(countdown.remaining)}.`}</strong>{" "}
        {idle
          ? `Stay signed in to keep working. The ${ADMIN_SESSION_MAX_MINUTES / 60}-hour limit does not change.`
          : "Save your work. You will need to sign in again with your password and authenticator code."}
      </p>
      {idle ? <button type="button" className="admin-secondary-action" onClick={countdown.staySignedIn} disabled={countdown.extending} aria-busy={countdown.extending}>
        {countdown.extending ? "Keeping session active…" : "Stay signed in"}
      </button> : null}
    </div> : null}
    {countdown.phase === "ended" ? <div className="admin-session-warning admin-session-ended">
      <p><strong>Your Super Admin session has ended.</strong> Changes can no longer be saved from this page.</p>
      <a className="admin-primary-action" href={signInHref}>Sign in again</a>
    </div> : null}
  </>;
}
