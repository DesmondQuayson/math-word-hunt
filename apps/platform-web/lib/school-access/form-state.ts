export type AuthorizedCodeFormState = Readonly<{
  status: "idle" | "error";
  message: string;
}>;

export const initialAuthorizedCodeFormState: AuthorizedCodeFormState = Object.freeze({
  status: "idle",
  message: ""
});
