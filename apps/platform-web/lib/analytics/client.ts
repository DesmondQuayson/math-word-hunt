// Browser-side attribution helpers. Imported only by client components.
//
// The first page and the source class of a visit are kept in session storage
// (gone when the tab closes, never sent to MathNexa's own servers) so that a
// later sign-up can report which page and kind of source the visit started
// from. Storage is passed in rather than read from a global so the logic is
// testable and tolerant of storage being unavailable (private windows,
// blocked data). Nothing here can throw into the page.
import { track } from "@vercel/analytics";

import { classifyEntrySource, classifyLandingPath, isSourceClass, type AnalyticsEventName, type LandingPath, type SourceClass } from "./attribution";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type EntryAttribution = Readonly<{ landing: LandingPath; source: SourceClass }>;

const ENTRY_KEY = "mathnexa.analytics.entry";
const FALLBACK: EntryAttribution = Object.freeze({ landing: "other", source: "direct" });

export function sessionStorageOrNull(): StorageLike | null {
  try {
    const storage = globalThis.sessionStorage;
    // Some browsers expose the object but throw on use when storage is blocked.
    storage.getItem(ENTRY_KEY);
    return storage;
  } catch {
    return null;
  }
}

export function readEntry(storage: StorageLike | null): EntryAttribution | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ENTRY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { landing, source } = parsed as Record<string, unknown>;
    if (typeof landing !== "string") return null;
    // Re-validate so an edited value still maps onto the fixed vocabularies.
    return { landing: classifyLandingPath(landing), source: isSourceClass(source) ? source : "other" };
  } catch {
    return null;
  }
}

export function rememberEntry(storage: StorageLike, location: Readonly<{ pathname: string; search: string; host: string }>, referrer: string): EntryAttribution {
  const existing = readEntry(storage);
  if (existing) return existing;
  const entry: EntryAttribution = { landing: classifyLandingPath(location.pathname), source: classifyEntrySource(location.search, referrer, location.host) };
  try {
    storage.setItem(ENTRY_KEY, JSON.stringify(entry));
  } catch {
    // Storage full or blocked: the entry is simply not remembered.
  }
  return entry;
}

export type TrackFunction = (name: string, properties?: Record<string, string | number | boolean | null>) => void;

/**
 * Sends one funnel event with the visit's first page and source class (two
 * properties, the Pro plan's limit). `track` queues the event until the
 * analytics script has loaded and does nothing when analytics is not mounted,
 * and any failure is swallowed: analytics can never interrupt the page.
 */
export function trackFunnelEvent(name: AnalyticsEventName, storage: StorageLike | null, send: TrackFunction = track): void {
  try {
    const entry = readEntry(storage) ?? FALLBACK;
    send(name, { landing: entry.landing, source: entry.source });
  } catch {
    // Analytics is best effort.
  }
}
