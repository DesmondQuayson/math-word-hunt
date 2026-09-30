import { notFound, redirect } from "next/navigation";

import { adminSignInPath } from "@/lib/admin/access-response";
import { inspectAdminAccess } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function AdminMapPrepRoute() {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") {
    if (access.state === "reauth-required" && access.recoverable) redirect(adminSignInPath("/admin?section=map-prep"));
    notFound();
  }
  redirect("/admin?section=map-prep");
}
