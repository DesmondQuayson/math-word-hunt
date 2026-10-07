/**
 * Confirmation-email resend pacing.
 *
 * Supabase Auth refuses a second confirmation or recovery email to the same
 * address inside its per-address window (60 seconds by default) with HTTP 429
 * and "For security purposes, you can only request this after N seconds." That
 * refusal is pacing, not a delivery failure: the first email was sent. These
 * helpers let the application start the same countdown when it sends, honour
 * the provider's own clock (confirmation_sent_at) when it knows it, and tell a
 * pacing refusal apart from a real send failure.
 */

export const RESEND_COOLDOWN_SECONDS = 60;

/** Seconds the provider asked us to wait, when the error is its per-address pacing refusal; otherwise null. */
export function providerResendWaitSeconds(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  const message = String((error as { message?: unknown }).message ?? "");
  const wait = /only request this after (\d{1,4}) seconds?/i.exec(message);
  if (!wait) return null;
  if (status !== 429 && code !== "over_email_send_rate_limit") return null;
  const seconds = Number(wait[1]);
  return Number.isInteger(seconds) && seconds > 0 ? Math.min(seconds, 3600) : null;
}

/**
 * Remaining wait, in whole seconds, from every clock the server can see: the
 * countdown cookie it set (which the visitor can delete) and the provider's own
 * confirmation_sent_at (which it cannot).
 */
export function resendCooldownRemaining(input: Readonly<{
  nowSeconds: number;
  cookieRetryAt?: string | null;
  confirmationSentAt?: string | null;
  windowSeconds?: number;
}>): number {
  const window = input.windowSeconds ?? RESEND_COOLDOWN_SECONDS;
  const fromCookie = Number.parseInt(input.cookieRetryAt ?? "", 10);
  const sentAt = input.confirmationSentAt ? Date.parse(input.confirmationSentAt) : Number.NaN;
  const fromProvider = Number.isFinite(sentAt) ? Math.ceil(sentAt / 1000) + window : 0;
  const retryAt = Math.max(Number.isFinite(fromCookie) ? fromCookie : 0, fromProvider);
  return Math.max(0, Math.min(window, retryAt - input.nowSeconds));
}

export function resendCooldownMessage(seconds: number): string {
  return `Wait ${seconds} second${seconds === 1 ? "" : "s"} before requesting another confirmation email.`;
}
