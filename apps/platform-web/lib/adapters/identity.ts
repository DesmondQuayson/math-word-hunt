export type AnonymousTeacherSession = Readonly<{
  status: "anonymous";
  teacher: null;
  message: "Teacher accounts are not connected in this preview.";
}>;

const anonymousTeacherSession: AnonymousTeacherSession = Object.freeze({
  status: "anonymous",
  teacher: null,
  message: "Teacher accounts are not connected in this preview."
});

export async function getTeacherSession(): Promise<AnonymousTeacherSession> {
  return anonymousTeacherSession;
}
