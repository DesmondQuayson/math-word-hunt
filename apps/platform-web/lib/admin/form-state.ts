export type AdminAuthFormState = Readonly<{
  status: "idle" | "error" | "enrollment";
  message: string;
  factorId?: string;
  qrCode?: string;
  secret?: string;
}>;

export const initialAdminAuthFormState: AdminAuthFormState = Object.freeze({ status: "idle", message: "" });
