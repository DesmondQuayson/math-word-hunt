"use client";

import { Analytics } from "@vercel/analytics/next";
import { useEffect } from "react";

import { beforeSendAnalyticsEvent } from "@/lib/analytics/attribution";
import { rememberEntry, sessionStorageOrNull } from "@/lib/analytics/client";

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
  return <Analytics beforeSend={beforeSendAnalyticsEvent} debug={false} />;
}
