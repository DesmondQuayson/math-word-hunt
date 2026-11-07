export type AuthFormState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
  confirmation?: Readonly<{
    maskedEmail: string;
    /** Seconds until the provider accepts another confirmation email for this address. */
    cooldownSeconds?: number;
  }>;
}>;

export const initialAuthFormState: AuthFormState = Object.freeze({ status: "idle", message: "" });

export type EmailConfirmationState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  destination?: string;
  cooldownSeconds?: number;
}>;

export const initialEmailConfirmationState: EmailConfirmationState = Object.freeze({
  status: "idle",
  message: ""
});
