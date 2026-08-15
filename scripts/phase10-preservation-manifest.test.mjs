import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PHASE10_MANIFEST_COMPONENTS,
  buildPhase10Manifest,
  comparePhase10Manifests,
  persistAndVerifyPhase10Manifest,
  verifyPhase10Manifest
} from "./phase10-preservation-manifest.mjs";

const projectRef = "gcmuhzxkwvfireyrearl";
const productionProjectRef = "ioodoktlxvvmghyvevgn";
const tableSnapshots = Object.values(PHASE10_MANIFEST_COMPONENTS).flat().map((qualifiedName) => {
  const [schema, table] = qualifiedName.split(".");
  return { schema, table, present: true, primaryKey: ["id"], rowCount: 0, rows: [] };
});

function manifest(capturedAt = "2026-08-06T12:34:56.123456Z") {
  return buildPhase10Manifest({
    projectRef,
    productionProjectRef,
    candidateTree: "a".repeat(40),
    gitHead: "b".repeat(40),
    syntheticRunId: "c".repeat(32),
    capturedAt,
    tableSnapshots,
    bucketDefinitions: [{ id: "private-homework", public: false }],
    storageObjects: []
  });
}

test("manifest is deterministic across capture timestamps and verifies after read-back", () => {
  const before = manifest();
  const after = manifest("2026-08-06T12:35:01.000001Z");
  assert.equal(before.checksum, after.checksum);
  assert.equal(comparePhase10Manifests(before, after).identical, true);
  const root = mkdtempSync(join(tmpdir(), "phase10-manifest-test-"));
  try {
    assert.equal(persistAndVerifyPhase10Manifest(join(root, "manifest.json"), before).checksum, before.checksum);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest hashes sensitive fields and detects component drift", () => {
  const snapshots = structuredClone(tableSnapshots);
  const users = snapshots.find((entry) => entry.schema === "auth" && entry.table === "users");
  users.rowCount = 1;
  users.rows = [{ id: "11111111-1111-1111-1111-111111111111", email: "owner@example.invalid", created_at: "2026-08-06T12:34:56Z" }];
  const withUser = buildPhase10Manifest({
    projectRef, productionProjectRef, candidateTree: "a".repeat(40), gitHead: "b".repeat(40),
    syntheticRunId: "c".repeat(32), capturedAt: "2026-08-06T12:34:56.123456Z",
    tableSnapshots: snapshots, bucketDefinitions: [], storageObjects: []
  });
  const serialized = JSON.stringify(withUser);
  assert.doesNotMatch(serialized, /owner@example\.invalid|11111111-1111/);
  assert.equal(comparePhase10Manifests(manifest(), withUser).identical, false);
  assert.throws(() => verifyPhase10Manifest({ ...withUser, checksum: "0".repeat(64) }), /checksum-invalid/);
});

test("Production project reference fails closed", () => {
  assert.throws(() => buildPhase10Manifest({
    projectRef: productionProjectRef, productionProjectRef, candidateTree: "a".repeat(40), gitHead: "b".repeat(40),
    syntheticRunId: "c".repeat(32), capturedAt: "2026-08-06T12:34:56.123456Z",
    tableSnapshots, bucketDefinitions: [], storageObjects: []
  }), /staging-project-guard/);
});
