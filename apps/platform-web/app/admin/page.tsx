import { notFound, redirect } from "next/navigation";

import { adminSignOutAction } from "./actions";
import { AdminCommandCenter } from "@/components/admin/admin-command-center";
import { AdminResourceLibrary } from "@/components/admin/admin-resource-library";
import { AdminGamePackageLibrary } from "@/components/admin/admin-game-package-library";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminSecurityConfig } from "@/lib/admin/config";
import { loadAdminDashboard } from "@/lib/admin/dashboard";
import { isAdminSectionKey } from "@/lib/admin/navigation";
import { loadAdminResourceLibrary } from "@/lib/admin/resource-library";
import { loadAdminGamePackages } from "@/lib/admin/game-package-library";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectAdminAccess } from "@/lib/admin/session";

export const metadata = { title: "Super Admin", robots: { index: false, follow: false, noarchive: true } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ csrf?: string; section?: string; upload?: string; publish?: string; package?: string }> }) {
  const access = await inspectAdminAccess();
  if (access.state === "disabled" || access.state === "non-admin") notFound();
  if (access.state === "unauthenticated") redirect("/admin/sign-in");
  if (access.state === "mfa-required") redirect("/admin/mfa");
  if (access.state === "reauth-required") redirect("/admin/sign-in?expired=1");
  if (access.state === "unavailable") return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Restricted system" title="Admin access unavailable" description="Authorization could not be verified, so access was denied." />
  </Container>;
  const config = getAdminSecurityConfig();
  if (!config) notFound();
  const csrfToken = createAdminCsrfToken(config);
  const params = await searchParams;
  const allowedSection = isAdminSectionKey(params.section) ? params.section : "dashboard";
  const snapshot = await loadAdminDashboard();
  const libraryKind = allowedSection === "homework" ? "homework" : allowedSection === "quizzes" ? "quizzes" : null;
  const library = libraryKind ? await loadAdminResourceLibrary(libraryKind) : null;
  const gameLibrary = allowedSection === "games" ? await loadAdminGamePackages() : null;

  return <>
    {params.csrf === "invalid" ? <Container className="page-stack" width="compact"><PageHeader eyebrow="Request expired" title="The state-changing request was blocked" description="Reload the admin workspace before trying again." /></Container> : null}
    <AdminCommandCenter snapshot={snapshot} activeSection={allowedSection} csrfToken={csrfToken} signOutAction={adminSignOutAction}
      moduleContent={allowedSection === "games" && gameLibrary ? <AdminGamePackageLibrary snapshot={gameLibrary} csrfToken={csrfToken} result={params.package} /> : libraryKind && library ? <AdminResourceLibrary kind={libraryKind} snapshot={library} csrfToken={csrfToken} result={params.upload??params.publish} /> : undefined} />
  </>;
}
