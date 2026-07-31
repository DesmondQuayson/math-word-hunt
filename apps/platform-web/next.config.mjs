import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  transpilePackages: ["@math-vocabulary-hunt/platform-core"],
  outputFileTracingIncludes: {
    "/game/runtime/*": ["../../docs/index.html", "../../docs/vocab.js"]
  },
  turbopack: {
    root: repositoryRoot
  }
};

export default nextConfig;
