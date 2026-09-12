import "server-only";

/**
 * The deployed source revision reported by `/api/health` (production bug sweep
 * BS-08).
 *
 * `MVH_BUILD_ID` used to supply that field. It is a hand-set project
 * environment variable, so it froze at the commit it was first given
 * (`e5c5294…`) and every later deployment kept publishing that stale revision —
 * `lib/game-access/runtime-generation.ts` had already stopped trusting it for
 * exactly this reason. `MVH_BUILD_ID` still feeds the admin operations
 * snapshot, which is out of scope here; the health endpoint now resolves the
 * revision itself.
 *
 * Resolution order, all server-side and automatic:
 *  1. `VERCEL_GIT_COMMIT_SHA` — the platform's own per-deployment commit,
 *     attached both to Git-connected deployments and to CLI deployments made
 *     from the repository. Nothing has to be maintained for a new release.
 *  2. `MVH_SOURCE_REVISION` — the revision a deployment pipeline stamps onto
 *     the deployment, for the case where a deployment carries no Git metadata.
 *  3. `"unknown"` — an honest absence. Never a guess, never a constant that a
 *     future deployment could inherit.
 *
 * The value is a lowercase commit SHA (Vercel supplies the full 40 characters,
 * which is the shape `/api/health` has always published). It is public
 * information: a revision identifier, no secret, no deployment id, no host.
 */

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

export const UNKNOWN_SOURCE_REVISION = "unknown";

export function getDeployedSourceRevision(source: EnvironmentSource = process.env): string {
  for (const candidate of [source.VERCEL_GIT_COMMIT_SHA, source.MVH_SOURCE_REVISION]) {
    const value = candidate?.trim() ?? "";
    if (COMMIT_SHA.test(value)) return value.toLowerCase();
  }
  return UNKNOWN_SOURCE_REVISION;
}
