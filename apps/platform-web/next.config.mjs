import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

import { buildSecurityHeaders } from "./lib/security/headers.mjs";
import { DEVELOPMENT_PLATFORM_HEADER_SOURCE } from "./lib/security/route-owned-headers.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * A function of Next's phase so the local development server can match what
 * Vercel serves. Only PHASE_DEVELOPMENT_SERVER leaves the routes that own their
 * security headers (lib/security/route-owned-headers.mjs) to those headers and
 * adds React's development 'unsafe-eval' (lib/security/headers.mjs). `next
 * build` (every Vercel deployment, and the routes manifest `next start`
 * serves) ships the same header rules as before.
 *
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
export default function nextConfig(phase) {
  const developmentServer = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    devIndicators: false,
    // Do not advertise the framework and its version to every visitor.
    poweredByHeader: false,
    experimental: { cpus: 2 },
    async headers() {
      const concealmentHeaders = [
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" }
      ];
      return [
        // `next dev` never lets a route header replace a configured one, so
        // there the platform headers skip the routes that send their own
        // (otherwise base-uri 'none' blocked every internal game's <base href>).
        developmentServer
          ? { source: DEVELOPMENT_PLATFORM_HEADER_SOURCE, headers: buildSecurityHeaders(process.env, { developmentServer }) }
          : { source: "/:path*", headers: buildSecurityHeaders() },
        { source: "/admin", headers: concealmentHeaders },
        { source: "/admin/:path*", headers: concealmentHeaders },
        {
          // The Math Vocabulary Hunt audio runtime is content-addressed: its URL
          // changes whenever its content changes, so any cached copy of a given
          // URL is correct forever. Immutable caching is therefore safe AND is
          // part of the fix: aggressive intermediaries (school proxies) may pin
          // an old runtime for as long as they like, because a new build always
          // references a new URL. The enhanced game document itself stays
          // no-store, so it always names the current runtime.
          source: "/game-suite/:runtime(mvh-audio-runtime\\.[0-9a-f]{12}\\.js)",
          headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
        }
      ];
    },
    transpilePackages: ["@math-vocabulary-hunt/platform-core"],
    outputFileTracingIncludes: {
      "/game/runtime/*": ["../../docs/index.html", "../../docs/vocab.js"]
    },
    turbopack: {
      root: repositoryRoot
    }
  };
}
