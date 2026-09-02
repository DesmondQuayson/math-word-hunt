import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    // Byte-preserved standalone runtime; integrity and behavior are covered by
    // the dedicated native parity and original Number Cross suites.
    "public/internal-games/**",
    // Generated version-atomic audio runtime: a content-hashed concatenation of
    // the two lint-covered source modules. Lint the sources, not the artifact.
    "public/game-suite/mvh-audio-runtime.*.js"
  ])
]);
