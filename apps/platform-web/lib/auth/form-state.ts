export type AuthFormState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
  confirmation?: Readonly<{
    maskedEmail: string;
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
