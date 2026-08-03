import { describe, expect, it } from "vitest";

import { inspectPdfUpload, normalizePdfFilename } from "./pdf-validation";

function pdf(body = "1 0 obj << /Type /Catalog >> endobj"): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`);
}

describe("Phase 8D PDF upload inspection", () => {
  it("normalizes owner filenames without retaining paths or unsafe characters", () => {
    expect(normalizePdfFilename("C:\\Uploads\\Grade 4 – Fractions!.PDF")).toBe("grade-4-fractions.pdf");
    expect(normalizePdfFilename("../.pdf")).toBeNull();
  });

  it("accepts standard PDFs, AcroForms, and embedded educational image objects", () => {
    const result = inspectPdfUpload({
      filename: "fraction-practice.pdf",
      mimeType: "application/pdf",
      bytes: pdf("1 0 obj << /Type /Catalog /AcroForm 2 0 R >> endobj\n2 0 obj << /Fields [] >> endobj\n3 0 obj << /Subtype /Image /Width 100 /Height 80 >> endobj")
    });
    expect(result).toMatchObject({ decision: "accepted", hasAcroForm: true, findings: [] });
  });

  it.each([
    ["pdf-javascript", "/JavaScript << /JS (alert) >>"],
    ["launch-action", "/Launch << /F (program.exe) >>"],
    ["embedded-file", "/EmbeddedFiles << /Filespec 3 0 R >>"],
    ["external-action", "/GoToR << /F (https://example.test) >>"],
    ["additional-actions", "/AA << /O 4 0 R >>"]
  ])("quarantines %s", (code, structure) => {
    const result = inspectPdfUpload({ filename: "unsafe.pdf", mimeType: "application/pdf", bytes: pdf(structure) });
    expect(result.decision).toBe("quarantined");
    expect(result.findings.map((finding) => finding.code)).toContain(code);
  });

  it("fails closed on MIME, magic-byte, size, and EOF mismatches", () => {
    const result = inspectPdfUpload({ filename: "fake.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("not a pdf") });
    expect(result.decision).toBe("quarantined");
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["invalid-filename", "invalid-mime", "invalid-size", "invalid-magic", "missing-eof"]));
  });
});
