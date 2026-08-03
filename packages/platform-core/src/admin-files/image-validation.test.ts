import { describe, expect, it } from "vitest";
import { inspectImageUpload } from "./image-validation";

describe("Phase 8D preview image inspection", () => {
  it("accepts bounded PNG dimensions from matching magic and MIME evidence", () => {
    const bytes = new Uint8Array(32);
    bytes.set([137,80,78,71,13,10,26,10],0);
    const view = new DataView(bytes.buffer); view.setUint32(16,640); view.setUint32(20,480);
    expect(inspectImageUpload({ filename: "Classroom Preview.PNG", mimeType: "image/png", bytes })).toMatchObject({ decision:"accepted", normalizedFilename:"classroom-preview.png", width:640, height:480 });
  });
  it("quarantines spoofed or dimensionless image uploads", () => {
    const result = inspectImageUpload({ filename:"preview.png", mimeType:"image/png", bytes:new Uint8Array(32) });
    expect(result.decision).toBe("quarantined");
    expect(result.findings).toEqual(expect.arrayContaining(["invalid-magic","invalid-dimensions"]));
  });
});
