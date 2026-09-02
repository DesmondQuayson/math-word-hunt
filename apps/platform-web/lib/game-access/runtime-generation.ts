import { MVH_AUDIO_RUNTIME_FILE } from "./mvh-audio-runtime-manifest.mjs";

/**
 * The non-secret generation identifier stamped onto every Math Vocabulary Hunt
 * launch URL (`/game/runtime/index.html?launch=<generation>`).
 *
 * Why the DOCUMENT needs a version when the audio runtime is already
 * content-hashed: a hashed asset only helps once a NEW document asks for it.
 * A game document that survives in memory (a tab left open across deploys, or
 * a back/forward-cache revival) or an intermediary that keys the document by
 * URL can keep an old generation alive even though every server byte is
 * correct. Giving each deployment's launch URL its own identity means an old
 * document entry can never be mistaken for the current generation.
 *
 * The value is automatic, never hand-maintained:
 *  - on Vercel, the deployment's own commit SHA;
 *  - elsewhere (local, tests), the content hash of the generated audio
 *    runtime, which changes whenever the audio runtime changes.
 *
 * Deliberately NOT MVH_BUILD_ID: that identifier is known to go stale.
 */
export function gameRuntimeGeneration(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return sha.slice(0, 12).toLowerCase();
  const hashed = MVH_AUDIO_RUNTIME_FILE.match(/\.([0-9a-f]{12})\.js$/);
  return hashed ? hashed[1] : "development";
}

export function gameLaunchHref(): string {
  return `/game/runtime/index.html?launch=${gameRuntimeGeneration()}`;
}
