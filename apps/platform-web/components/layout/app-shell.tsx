import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { EnvironmentBanner } from "@/components/environment-banner";
import { PilotStatusBanner } from "@/components/pilot/pilot-status-banner";
import { getPublicEnvironmentView } from "@/lib/environment/server";

import { SkipLink } from "./skip-link";

type AppShellProps = Readonly<{
  children: ReactNode;
}>;

export function AppShell({ children }: AppShellProps) {
  const environment = getPublicEnvironmentView();
  return (
    <>
      <SkipLink />
      {environment.previewBanner ? <EnvironmentBanner /> : null}
      <PilotStatusBanner />
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
