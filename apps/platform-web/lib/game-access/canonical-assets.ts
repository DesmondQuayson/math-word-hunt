import "server-only";

import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const CANONICAL_ASSETS = Object.freeze({
  "index.html": { contentType: "text/html; charset=utf-8", sourcePath: "docs/index.html" },
  "vocab.js": { contentType: "text/javascript; charset=utf-8", sourcePath: "docs/vocab.js" }
} as const);

export type CanonicalAssetName = keyof typeof CANONICAL_ASSETS;

export function isCanonicalAssetName(value: unknown): value is CanonicalAssetName {
  return typeof value === "string" &&
    basename(value) === value &&
    Object.prototype.hasOwnProperty.call(CANONICAL_ASSETS, value);
}

export async function readCanonicalServerAsset(name: CanonicalAssetName): Promise<Readonly<{ body: Buffer; contentType: string }>> {
  const definition = CANONICAL_ASSETS[name];
  const repositoryRoot = basename(process.cwd()) === "platform-web" && basename(dirname(process.cwd())) === "apps"
    ? resolve(process.cwd(), "..", "..")
    : process.cwd();
  const body = await readFile(resolve(repositoryRoot, definition.sourcePath));
  return Object.freeze({ body, contentType: definition.contentType });
}
