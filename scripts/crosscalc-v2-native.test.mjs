import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(repositoryRoot, "apps/platform-web/public");
const nativeRoot = resolve(publicRoot, "internal-games/crosscalc-v2");
const coreRoot = resolve(repositoryRoot, "apps/platform-web/features/games/crosscalc-v2/core");
const standaloneRoot = process.env.CROSSCALC_SOURCE_DIR
  ? resolve(process.env.CROSSCALC_SOURCE_DIR)
  : resolve(repositoryRoot, "..", "..", "crosscalc");
const approvedSource = "9d27dbc21fce043569fae89ab5b4434ae2d0bac0";
const adapterSource = "8bc4704";
const assetHashes = Object.freeze({
  "assets/index-B-S_H4Ce.css": "f5c39c4c16b25b5cdd24827147449ef11c5faaa2f0f769b8a7dec3897568bdbf",
  "assets/index-B0m_QJed.js": "5bb4968416f222c3bcdebfc49844d7084d59999fd5b1efeff049a26fcaf426ac",
  "assets/oldskool-cc0-CQNT44Pl.mp3": "888052a10a8939c8fa543b5e383e9852e2682e123aa077097c83de9976337a88"
});

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test("V2 native production assets are byte-identical to the verified standalone build", () => {
  assert.equal(existsSync(standaloneRoot), true, `standalone source missing: ${standaloneRoot}`);
  for (const [path, hash] of Object.entries(assetHashes)) {
    const native = readFileSync(resolve(nativeRoot, path));
    const standalone = readFileSync(resolve(standaloneRoot, "dist", path));
    assert.equal(sha256(native), hash, path);
    assert.deepEqual(native, standalone, path);
  }
});

test("the auditable native TypeScript core is byte-identical to the integration-approved standalone core", () => {
  const names = readdirSync(coreRoot).filter((name) => name.endsWith(".ts")).sort();
  assert.deepEqual(names, ["arithmetic.ts", "generator.ts", "hints.ts", "progress.ts", "random.ts", "reasoning.ts", "session.ts", "solver.ts", "types.ts", "validator.ts"]);
  for (const name of names) assert.deepEqual(readFileSync(resolve(coreRoot, name)), readFileSync(resolve(standaloneRoot, "src/core", name)), name);
});

test("V2 retains its versioned provenance, result, storage, audio, and palette contracts", () => {
  const bundle = readFileSync(resolve(nativeRoot, "assets/index-B0m_QJed.js"), "utf8");
  for (const contract of ["mathnexa.crosscalc.v2", "crosscalc-result/2", "0.2.0", "number-placement", "mathnexa:game-result"]) assert.ok(bundle.includes(contract), contract);
  for (const mode of ["addition", "subtraction", "multiplication", "division", "mixed"]) assert.ok(bundle.includes(mode), mode);
  assert.doesNotMatch(bundle, /MATHNEXA_GAME_LAUNCH_SECRET|localhost|[A-Za-z]:\\\\/);
  const styles = readFileSync(resolve(nativeRoot, "assets/index-B-S_H4Ce.css"), "utf8").toLowerCase();
  for (const color of ["#071525", "#20cfe3", "#ff4f9a"]) assert.ok(styles.includes(color), color);
});

test("only same-origin release runtime assets ship and the preview banner is explicit", () => {
  const shipped = files(nativeRoot).map((path) => relative(nativeRoot, path).replaceAll("\\", "/")).sort();
  assert.deepEqual(shipped, [
    "assets/index-B-S_H4Ce.css",
    "assets/index-B0m_QJed.js",
    "assets/oldskool-cc0-CQNT44Pl.mp3",
    "integration.css"
  ]);
  assert.equal(shipped.some((path) => path.endsWith(".map") || path.endsWith(".zip")), false);
  const document = readFileSync(resolve(repositoryRoot, "apps/platform-web/features/games/crosscalc-v2/document.ts"), "utf8");
  for (const value of [approvedSource, adapterSource, "Admin Preview · Version 0.2.0", "NOT LIVE", "/internal-games/crosscalc-v2/"]) assert.ok(document.includes(value), value);
  assert.doesNotMatch(document, /iframe|https?:\/\//);
  const integration = readFileSync(resolve(nativeRoot, "integration.css"), "utf8");
  assert.match(integration, /@media \(max-width: 560px\)[\s\S]*header \.toolbar \{ justify-content: flex-start; \}/);
});

test("the V2 release thumbnail is the optimized exact 1200x675 WebP catalog format", () => {
  const thumbnail = readFileSync(resolve(publicRoot, "media/games/crosscalc-v2-rc.webp"));
  assert.equal(thumbnail.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(thumbnail.subarray(8, 16).toString("ascii"), "WEBPVP8X");
  assert.equal(thumbnail.readUIntLE(24, 3) + 1, 1200);
  assert.equal(thumbnail.readUIntLE(27, 3) + 1, 675);
  assert.ok(thumbnail.byteLength > 50_000 && thumbnail.byteLength < 100_000, thumbnail.byteLength);
});

test("one CrossCalc identity is version-gated between the V1 rollback and V2 public runtime", () => {
  const registry = readFileSync(resolve(repositoryRoot, "apps/platform-web/lib/games/internal-registry.ts"), "utf8");
  assert.match(registry, /"crosscalc"\s*:\s*Object\.freeze\(\{/);
  assert.ok(registry.includes('assetBase: "/internal-games/crosscalc/"'));
  assert.ok(registry.includes("CROSSCALC_V2_PREVIEW"));
  assert.ok(registry.includes('version === "0.2.0"'));
  assert.doesNotMatch(registry, /"crosscalc-v2"\s*:/);
  const adminRoute = readFileSync(resolve(repositoryRoot, "apps/platform-web/app/admin/games/catalog/[catalogId]/preview/route.ts"), "utf8");
  const directRoute = readFileSync(resolve(repositoryRoot, "apps/platform-web/app/games/crosscalc/v2/preview/route.ts"), "utf8");
  assert.ok(adminRoute.includes('requestedVersion === "0.2.0"'));
  assert.ok(directRoute.includes("inspectAdminAccess"));
  assert.ok(directRoute.includes('status: 404'));
  const migration = readFileSync(resolve(repositoryRoot, "supabase/migrations/20260814190000_crosscalc_internal_game.sql"), "utf8");
  assert.ok(migration.includes("'mixed','draft',32,'0.1.0'"));
  assert.doesNotMatch(migration, /0\.2\.0|crosscalc-v2/);
  const release = readFileSync(resolve(repositoryRoot, "supabase/migrations/20260816050000_crosscalc_v2_public_release.sql"), "utf8");
  assert.ok(release.includes("f457a0db-98bb-4401-8584-c8ba5cd93c98"));
  assert.ok(release.includes("version='0.2.0'"));
  assert.ok(release.includes("version=target_row.snapshot->>'version'"));
  assert.ok(release.includes("crosscalc-result/2"));
});
