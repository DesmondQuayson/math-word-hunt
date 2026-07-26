export type TeacherErrorCode =
  | "unauthorized"
  | "unavailable"
  | "validation"
  | "not-found"
  | "conflict";

export type TeacherContractError = Readonly<{
  code: TeacherErrorCode;
  message: string;
  field?: string;
}>;

export type TeacherResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: TeacherContractError }>;

export function teacherSuccess<T>(value: T): TeacherResult<T> {
  return { ok: true, value };
}

export function teacherFailure(
  code: TeacherErrorCode,
  message: string,
  field?: string
): TeacherResult<never> {
  return {
    ok: false,
    error: field ? { code, message, field } : { code, message }
  };
}

/** Unknown or untrusted authority always resolves to a denied result. */
export function denyTeacherOperation(
  message = "Teacher authorization could not be verified."
): TeacherResult<never> {
  return teacherFailure("unauthorized", message);
}
