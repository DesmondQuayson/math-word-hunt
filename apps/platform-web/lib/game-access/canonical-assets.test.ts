import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isCanonicalAssetName, readCanonicalServerAsset } from "./canonical-assets";

describe("protected canonical asset package", () => {
  it("allows only the two preserved canonical source assets", () => {
    expect(isCanonicalAssetName("index.html")).toBe(true);
    expect(isCanonicalAssetName("vocab.js")).toBe(true);
    for (const value of ["../docs/index.html", "index-v6-backup.html", "math-word-hunt-v5.html", "secrets.env", ""]) {
      expect(isCanonicalAssetName(value), value).toBe(false);
    }
  });

  it("reads byte-identical canonical source without creating a public copy", async () => {
    const index = await readCanonicalServerAsset("index.html");
    const vocab = await readCanonicalServerAsset("vocab.js");
    expect(createHash("sha256").update(index.body).digest("hex")).toBe("7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5");
    expect(createHash("sha256").update(vocab.body).digest("hex")).toBe("caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46");
  });
});
