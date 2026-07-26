export type TeacherFormState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
}>;

export const initialTeacherFormState: TeacherFormState = Object.freeze({ status: "idle", message: "" });
