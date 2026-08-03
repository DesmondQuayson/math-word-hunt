import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { EnvironmentBanner } from "@/components/environment-banner";
import { PilotStatusBanner } from "@/components/pilot/pilot-status-banner";
import { getPublicEnvironmentView } from "@/lib/environment/server";
import { loadPublicOperationalNotices } from "@/lib/operations/server";

import { SkipLink } from "./skip-link";

type AppShellProps = Readonly<{
  children: ReactNode;
}>;

export async function AppShell({ children }: AppShellProps) {
  const environment = getPublicEnvironmentView();
  const notices = await loadPublicOperationalNotices();
  return (
    <>
      <SkipLink />
      {environment.previewBanner ? <EnvironmentBanner /> : null}
      {!environment.publicProduction && !environment.productionPlatform ? <PilotStatusBanner /> : null}
      {notices.map((notice) => <div className="environment-banner" role={notice.kind === "maintenance" ? "alert" : "status"} key={notice.kind}>
        <strong>{notice.kind === "maintenance" ? "Maintenance mode" : "MathNexa announcement"}:</strong> {notice.message}
      </div>)}
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
