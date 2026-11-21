export type AuthFormState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
  confirmation?: Readonly<{
    maskedEmail: string;
    /** Seconds until the provider accepts another confirmation email for this address. */
    cooldownSeconds?: number;
    /**
     * "sign-up": a confirmation email was just sent. "sign-in": the password
     * matched an account whose email is not confirmed yet, and no email has
     * been sent by this attempt.
     */
    origin?: "sign-up" | "sign-in";
  }>;
}>;

export const initialAuthFormState: AuthFormState = Object.freeze({ status: "idle", message: "" });

export type EmailConfirmationState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  destination?: string;
  cooldownSeconds?: number;
  /** Offered when this browser has no session: the link may have been opened on another device. */
  signInHref?: string;
}>;

export const initialEmailConfirmationState: EmailConfirmationState = Object.freeze({
  status: "idle",
  message: ""
});
