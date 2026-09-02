import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSecurityHeaders } from "./lib/security/headers.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
      { source: "/:path*", headers: buildSecurityHeaders() },
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

export default nextConfig;
