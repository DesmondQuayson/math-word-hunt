import "server-only";

/**
 * Resolve with `fallback` if `work` has not settled within `ms`. Used for
 * non-critical public reads (operational notices, the game catalog) so a slow
 * or cold provider can never hold the whole page render hostage — the page
 * degrades to its empty state instead of hanging. Never used for auth.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
