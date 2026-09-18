/**
 * A tiny in-memory, time-limited cache for one server-side value that rarely
 * changes but was being re-read from Supabase on every request (homepage +
 * speed V2: the Online Math Prep destination was fetched twice per launch).
 *
 * Semantics:
 * - the first read inside a TTL window performs the load; later reads within
 *   the window return the same value (including a `null` "not configured")
 * - concurrent reads share one in-flight load instead of stampeding
 * - a failed load is not cached, so the next read retries
 * - `invalidate()` drops the entry immediately (called after an admin publish
 *   on the same server instance; other instances converge within the TTL)
 *
 * Each serverless instance owns its own copy, so CMS changes always propagate
 * within one TTL and never later.
 */
export type TtlCache<T> = Readonly<{
  read: () => Promise<T>;
  invalidate: () => void;
  /** Milliseconds until the current entry expires, or 0 when empty. Test/diagnostic aid. */
  remainingMs: (now?: number) => number;
}>;

export function createTtlCache<T>(load: () => Promise<T>, ttlMs: number, clock: () => number = Date.now): TtlCache<T> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("ttlMs must be a positive number of milliseconds.");
  let entry: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;
  return Object.freeze({
    async read() {
      const now = clock();
      if (entry && entry.expiresAt > now) return entry.value;
      if (inFlight) return inFlight;
      inFlight = load().then(
        (value) => { entry = { value, expiresAt: clock() + ttlMs }; inFlight = null; return value; },
        (error) => { inFlight = null; throw error; }
      );
      return inFlight;
    },
    invalidate() { entry = null; },
    remainingMs(now = clock()) { return entry ? Math.max(0, entry.expiresAt - now) : 0; }
  });
}
