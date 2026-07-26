import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "qa-artifacts/**",
      ".vite/**",
      "dist/**",
      "dist2/**",
      "apps/platform-web/**",
      "docs/**/*.js",
      "vocab.js",
      "**/*.ts"
    ]
  },
  {
    ...js.configs.recommended,
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        CURRICULUM: "readonly",
        TERMS: "readonly",
        selfCheck: "readonly"
      }
    }
  }
];
