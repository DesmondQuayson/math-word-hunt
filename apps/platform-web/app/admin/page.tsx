import { notFound } from "next/navigation";

import { adminSignOutAction } from "./actions";
import { AdminCommandCenter } from "@/components/admin/admin-command-center";
import { AdminResourceLibrary } from "@/components/admin/admin-resource-library";
import { AdminGamePackageLibrary } from "@/components/admin/admin-game-package-library";
import { AdminCmsLibrary,AdminMediaLibrary } from "@/components/admin/admin-cms-library";
import { AdminAccountsLibrary } from "@/components/admin/admin-accounts-library";
import { AdminAnalyticsOperations } from "@/components/admin/admin-analytics-operations";
import { AdminMapPrep } from "@/components/admin/admin-map-prep";
import { parseAdminAnalyticsRange } from "@math-vocabulary-hunt/platform-core";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getAdminSecurityConfig } from "@/lib/admin/config";
import { loadAdminDashboard } from "@/lib/admin/dashboard";
import { isAdminSectionKey } from "@/lib/admin/navigation";
import { loadAdminResourceLibrary } from "@/lib/admin/resource-library";
import { loadAdminGamePackages } from "@/lib/admin/game-package-library";
import { loadAdminCmsLibrary } from "@/lib/admin/cms-library";
import { loadAdminAccounts } from "@/lib/admin/account-operations";
import { loadAdminAnalyticsOperations } from "@/lib/admin/analytics-operations";
import { loadAdminTaxonomy } from "@/lib/admin/taxonomy";
import { createAdminCsrfToken } from "@/lib/admin/security";
import { inspectAdminAccess } from "@/lib/admin/session";

export const metadata = { title: "Super Admin", robots: { index: false, follow: false, noarchive: true } };
export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ csrf?: string; section?: string; upload?: string; publish?: string; package?: string; cms?:string; media?:string; account?:string; from?:string; to?:string; ops?:string; taxonomy?:string; map?:string; grade?:string; topic?:string; lesson?:string; query?:string }> }) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") notFound();
  const config = getAdminSecurityConfig();
  if (!config) notFound();
  const csrfToken = createAdminCsrfToken(config);
  const params = await searchParams;
  const allowedSection = isAdminSectionKey(params.section) ? params.section : "dashboard";
  const snapshot = await loadAdminDashboard();
  const libraryKind = allowedSection === "homework" ? "homework" : allowedSection === "quizzes" ? "quizzes" : null;
  const library = libraryKind ? await loadAdminResourceLibrary(libraryKind) : null;
  const gameLibrary = allowedSection === "games" ? await loadAdminGamePackages() : null;
  const loadedCmsLibrary = allowedSection === "cms" || allowedSection === "media-library" || allowedSection === "map-prep" ? await loadAdminCmsLibrary() : null;
  const cmsLibrary = allowedSection === "cms" && loadedCmsLibrary ? { ...loadedCmsLibrary, documents: loadedCmsLibrary.documents.filter((document) => document.key !== "map-prep") } : loadedCmsLibrary;
  const taxonomy = ["homework","quizzes"].includes(allowedSection) ? await loadAdminTaxonomy() : null;
  const accountsLibrary = allowedSection === "users" || allowedSection === "subscriptions" ? await loadAdminAccounts() : null;
  const analyticsRange = parseAdminAnalyticsRange({ from: params.from ?? "", to: params.to ?? "" }) ?? parseAdminAnalyticsRange({})!;
  const analyticsOperations = ["analytics", "settings", "audit-log"].includes(allowedSection) ? await loadAdminAnalyticsOperations(analyticsRange) : null;

  return <>
    {params.csrf === "invalid" ? <Container className="page-stack" width="compact"><PageHeader eyebrow="Request expired" title="The state-changing request was blocked" description="Reload the admin workspace before trying again." /></Container> : null}
    <AdminCommandCenter snapshot={snapshot} activeSection={allowedSection} csrfToken={csrfToken} signOutAction={adminSignOutAction}
      moduleContent={analyticsOperations && (allowedSection === "analytics" || allowedSection === "settings" || allowedSection === "audit-log") ? <AdminAnalyticsOperations snapshot={analyticsOperations} csrfToken={csrfToken} section={allowedSection} result={params.ops} /> : accountsLibrary && (allowedSection === "users" || allowedSection === "subscriptions") ? <AdminAccountsLibrary snapshot={accountsLibrary} csrfToken={csrfToken} result={params.account} mode={allowedSection} /> : allowedSection === "cms" && cmsLibrary ? <AdminCmsLibrary snapshot={cmsLibrary} csrfToken={csrfToken} result={params.cms} /> : allowedSection === "media-library" && cmsLibrary ? <AdminMediaLibrary snapshot={cmsLibrary} csrfToken={csrfToken} result={params.media} /> : allowedSection === "map-prep" && cmsLibrary ? <AdminMapPrep snapshot={cmsLibrary} csrfToken={csrfToken} result={params.map} /> : allowedSection === "games" && gameLibrary ? <AdminGamePackageLibrary snapshot={gameLibrary} csrfToken={csrfToken} result={params.package} /> : libraryKind && library && taxonomy ? <AdminResourceLibrary kind={libraryKind} snapshot={library} taxonomy={taxonomy} csrfToken={csrfToken} result={params.upload??params.publish} taxonomyResult={params.taxonomy} initialFilters={{grade:params.grade,topic:params.topic,lesson:params.lesson,query:params.query}} /> : undefined} />
  </>;
}
