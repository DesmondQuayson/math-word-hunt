import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GAME_ROUTES, MVH_RUNTIME_CSP, internalGameCsp, startMobileGameplayHarness } from "./mobile-gameplay-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("the harness serves the Math Vocabulary Hunt runtime under the production route's exact CSP", () => {
  const route = read("apps/platform-web/app/game/runtime/[...asset]/route.ts");
  assert.ok(route.includes(`"Content-Security-Policy": "${MVH_RUNTIME_CSP}"`), "harness CSP drifted from the runtime route");
});

test("the harness serves internal games under the registry's exact directives and connect sources", () => {
  const registry = read("apps/platform-web/lib/games/internal-registry.ts");
  for (const directive of internalGameCsp("'self'").split("; ")) {
    const source = directive.startsWith("connect-src") ? "connect-src ${registration.connectSource}" : directive;
    assert.ok(registry.includes(`"${source}"`) || registry.includes(`\`${source}\``), `registry lacks ${directive}`);
  }
  for (const [key, connect] of [["crosscalc", "'self'"], ["number-cross", "'none'"], ["number-logic", "'self'"]]) {
    const entry = registry.slice(registry.indexOf(`"${key}": Object.freeze({`));
    assert.match(entry.slice(0, 400), new RegExp(`connectSource: "${connect}"`), key);
  }
});

test("every game document is served with its CSP, and the public game assets resolve", async () => {
  const server = await startMobileGameplayHarness(0);
  try {
    const { port } = server.address();
    for (const [key, route] of Object.entries(GAME_ROUTES)) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`);
      assert.equal(response.status, 200, key);
      assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/, key);
      assert.match(await response.text(), /<html lang="en">/, key);
    }
    for (const asset of ["/game-suite/canonical-runtime.css", "/internal-games/crosscalc-v2/integration.css", "/internal-games/crosscalc-v2/runtime-layout.js", "/internal-games/number-cross/integration.css", "/internal-games/number-logic/integration.css"]) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${asset}`)).status, 200, asset);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/../package.json`)).status, 404);
  } finally {
    server.close();
  }
});
