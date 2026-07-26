export type UserId = string & { readonly __userIdBrand: unique symbol };

export type AccountStatus =
  | "active"
  | "suspended"
  | "deletion-requested"
  | "closed";

export type PlatformRole = "teacher" | "platform-admin";

export type TeacherProfile = Readonly<{
  userId: UserId;
  displayName: string;
  accountStatus: AccountStatus;
  platformRole: PlatformRole;
  createdAt: string;
  updatedAt: string;
}>;

export function parseUserId(value: unknown): UserId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Invalid user id");
  }
  return value as UserId;
}
