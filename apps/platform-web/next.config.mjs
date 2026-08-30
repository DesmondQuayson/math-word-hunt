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
      { source: "/admin/:path*", headers: concealmentHeaders }
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
