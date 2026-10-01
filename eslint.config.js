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
  },
  {
    // The pinned Supabase CLI (2.109) turns telemetry off only for the exact
    // value "1" (or DO_NOT_TRACK=1). Anything else, including "true", is
    // ignored: telemetry is sent, and a slow endpoint can fail a release step
    // that actually succeeded ("Timeout while shutting down PostHog").
    files: ["**/*.mjs"],
    rules: {
      "no-restricted-syntax": ["error", {
        // Environment objects ({ SUPABASE_TELEMETRY_DISABLED: ... }) and
        // assignments (process.env.SUPABASE_TELEMETRY_DISABLED = ..., also
        // the computed ["..."] forms). Reads and destructuring are not matched.
        selector: [
          "ObjectExpression > Property[key.name='SUPABASE_TELEMETRY_DISABLED'][value.value!='1']",
          "ObjectExpression > Property[key.value='SUPABASE_TELEMETRY_DISABLED'][value.value!='1']",
          "AssignmentExpression[left.property.name='SUPABASE_TELEMETRY_DISABLED'][right.value!='1']",
          "AssignmentExpression[left.property.value='SUPABASE_TELEMETRY_DISABLED'][right.value!='1']"
        ].join(", "),
        message: "Set SUPABASE_TELEMETRY_DISABLED to the string \"1\"; the Supabase CLI ignores any other value."
      }]
    }
  }
];
