import "server-only";

/**
 * A fetch that Next.js will neither memoize nor cache.
 *
 * Inside a server render, Next.js memoizes identical GET requests and may serve
 * them from its data cache. PostgREST reads are GETs, so two reads of the same
 * table inside one render returned the SAME response even after a write between
 * them: reconciliation saw "before === after" and the access gate re-read the
 * stale entitlement it had just repaired. Every read that must observe a write
 * made moments earlier goes through this fetch. The per-call AbortController
 * signal is what opts a request out of memoization; `no-store` opts it out of
 * the data cache.
 */
export function createUncachedFetch(): typeof fetch {
  return (input, init) => fetch(input, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? new AbortController().signal
  });
}
