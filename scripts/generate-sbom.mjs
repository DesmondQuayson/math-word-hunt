/**
 * Generates a CycloneDX SBOM for the production dependency tree.
 *
 * Uses only `npm ls`, which is already present — adding an SBOM tool would mean
 * adding a dependency to the very tree we are trying to account for.
 *
 * `npm sbom` cannot be used directly here: it refuses to emit anything when the
 * tree contains overridden versions, and this project deliberately overrides
 * five transitive packages to newer, patched releases. npm reports those as
 * "invalid" purely because they differ from what the parent declared, which is
 * what an override is for.
 *
 * Usage: node scripts/generate-sbom.mjs [outputPath]
 */
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const output = process.argv[2] ?? "docs/security/sbom-production.cdx.json";
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

/**
 * Reads the tree via a temporary file rather than a pipe.
 *
 * `npm ls --json` on this workspace outgrows the child-process buffer, and npm
 * also exits non-zero because of the deliberate version overrides — between the
 * two, capturing stdout directly is unreliable. Redirecting to a file sidesteps
 * both: the exit code stops mattering, and so does the size.
 */
function npmLs() {
  const scratch = join(tmpdir(), `mathnexa-sbom-${process.pid}.json`);
  try {
    // Run inside the application workspace: the monorepo root declares no
    // runtime dependencies of its own, so a root-level query returns an empty
    // tree and would produce a truthful but useless SBOM.
    //
    // Invoked through the shell with a redirect rather than execFileSync: on
    // Windows the npm shim does not receive the --workspace argument reliably
    // through a direct spawn, and the redirect also sidesteps the
    // child-process buffer, which this tree outgrows.
    execSync(
      `npm ls --all --json --omit=dev --workspace @math-vocabulary-hunt/platform-web > "${scratch}"`,
      { stdio: ["ignore", "ignore", "ignore"] }
    );
  } catch {
    // Non-zero exit is expected while the version overrides are in place; the
    // JSON is still written in full.
  }
  try {
    return JSON.parse(readFileSync(scratch, "utf8"));
  } finally {
    try { unlinkSync(scratch); } catch { /* best effort */ }
  }
}

/** Flattens the dependency tree into one component per name@version. */
function collect(node, into = new Map()) {
  for (const [name, entry] of Object.entries(node.dependencies ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const version = entry.version ?? "unknown";
    const key = `${name}@${version}`;
    if (!into.has(key)) {
      into.set(key, {
        name,
        version,
        resolved: entry.resolved ?? null,
        license: entry.license ?? null,
        // A workspace link is first-party code, not a supply-chain import.
        workspace: typeof entry.resolved === "string" && !entry.resolved.startsWith("http")
      });
    }
    collect(entry, into);
  }
  return into;
}

const tree = npmLs();

const components = [...collect(tree).values()]
  .sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)))
  .map((entry) => ({
    type: "library",
    name: entry.name,
    version: entry.version,
    purl: `pkg:npm/${entry.name.replace("@", "%40")}@${entry.version}`,
    scope: "required",
    ...(entry.license ? { licenses: [{ license: { id: String(entry.license) } }] } : {}),
    properties: [
      { name: "mathnexa:source", value: entry.workspace ? "workspace" : "registry" },
      ...(entry.resolved && entry.resolved.startsWith("http")
        ? [{ name: "mathnexa:registry", value: new URL(entry.resolved).origin }]
        : [])
    ]
  }));

const registries = new Set(
  components.flatMap((c) => c.properties.filter((p) => p.name === "mathnexa:registry").map((p) => p.value))
);

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    // No timestamp: a changing field would make the artifact non-deterministic
    // and every regeneration would look like a change.
    component: {
      type: "application",
      name: rootPackage.name ?? "math-vocabulary-hunt",
      version: rootPackage.version ?? "0.0.0"
    },
    properties: [
      { name: "mathnexa:scope", value: "production-dependencies-only" },
      { name: "mathnexa:distinctRegistries", value: [...registries].sort().join(",") || "none" },
      { name: "mathnexa:componentCount", value: String(components.length) }
    ]
  },
  components
};

const serialized = `${JSON.stringify(bom, null, 2)}\n`;
writeFileSync(output, serialized);

console.log(`SBOM written to ${output}`);
console.log(`  components (production only): ${components.length}`);
console.log(`  distinct registries: ${[...registries].sort().join(", ") || "none"}`);
console.log(`  sha256: ${createHash("sha256").update(serialized).digest("hex")}`);
