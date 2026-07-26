export type AuthFormState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
}>;

export const initialAuthFormState: AuthFormState = Object.freeze({ status: "idle", message: "" });
