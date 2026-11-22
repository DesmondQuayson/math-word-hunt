"use client";

import { Analytics } from "@vercel/analytics/next";
import { Component, useEffect, type ReactNode } from "react";

import { beforeSendAnalyticsEvent } from "@/lib/analytics/attribution";
import { rememberEntry, sessionStorageOrNull } from "@/lib/analytics/client";

type AnalyticsBoundaryState = { failed: boolean };

/**
 * Keeps an analytics failure inside analytics. Vercel's <Analytics> calls the
 * analytics script (window.va) from its effects, when it registers and on every
 * client-side page change, without catching errors. A script that throws would
 * otherwise reach the page and replace it with the error screen (found on
 * staging, 2026-11-22). If anything below fails, the boundary renders nothing
 * for the rest of the visit and every page, form and checkout carries on.
 */
export class AnalyticsBoundary extends Component<Readonly<{ children: ReactNode }>, AnalyticsBoundaryState> {
  override state: AnalyticsBoundaryState = { failed: false };

  static getDerivedStateFromError(): AnalyticsBoundaryState {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Mounts Vercel Web Analytics (same-origin script and intake, no cookies) and
 * remembers the first page and source class of this browser session for the
 * sign-up event. Rendered only when MVH_WEB_ANALYTICS=enabled; every URL is
 * cut to its path, and private paths are never sent (beforeSendAnalyticsEvent).
 */
export function SiteAnalytics() {
  useEffect(() => {
    try {
      const storage = sessionStorageOrNull();
      if (storage) rememberEntry(storage, window.location, document.referrer);
    } catch {
      // Analytics is best effort.
    }
  }, []);
  return <AnalyticsBoundary><Analytics beforeSend={beforeSendAnalyticsEvent} debug={false} /></AnalyticsBoundary>;
}
