import { notFound, redirect } from "next/navigation";

import { inspectAdminAccess } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function AdminMapPrepRoute() {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") notFound();
  redirect("/admin?section=map-prep");
}
