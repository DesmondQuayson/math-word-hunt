/**
 * Friendly, field-level messages for the account forms, checked in the
 * browser before a request is sent.
 *
 * These rules MIRROR the server's validEmail/validPassword in
 * app/auth-actions.ts; they never replace them. The server action still
 * validates every submission and remains the only authority. Nothing here
 * stores, logs or transmits a value.
 */
export type AccountFieldErrors = Partial<Record<"email" | "password" | "passwordConfirmation", string>>;

export const FIELD_MESSAGES = Object.freeze({
  emailRequired: "Email is required.",
  emailInvalid: "Please enter a valid email address.",
  passwordRequired: "Password is required.",
  passwordTooShort: "Password must be at least 8 characters.",
  passwordTooLong: "Password must be 128 characters or fewer.",
  passwordComposition: "Password must include at least one letter and one number.",
  confirmationRequired: "Please confirm your password.",
  confirmationMismatch: "Passwords must match."
});

export function emailError(value: string): string | undefined {
  const email = value.trim();
  if (email.length === 0) return FIELD_MESSAGES.emailRequired;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return FIELD_MESSAGES.emailInvalid;
  return undefined;
}

/** For a password being chosen: the same 8–128 / letter / number rule the server enforces. */
export function newPasswordError(value: string): string | undefined {
  if (value.length === 0) return FIELD_MESSAGES.passwordRequired;
  if (value.length < 8) return FIELD_MESSAGES.passwordTooShort;
  if (value.length > 128) return FIELD_MESSAGES.passwordTooLong;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return FIELD_MESSAGES.passwordComposition;
  return undefined;
}

/** For signing in: only presence is checked, so no policy detail is revealed. */
export function currentPasswordError(value: string): string | undefined {
  return value.length === 0 ? FIELD_MESSAGES.passwordRequired : undefined;
}

export function confirmationError(password: string, confirmation: string): string | undefined {
  if (confirmation.length === 0) return FIELD_MESSAGES.confirmationRequired;
  return password === confirmation ? undefined : FIELD_MESSAGES.confirmationMismatch;
}
