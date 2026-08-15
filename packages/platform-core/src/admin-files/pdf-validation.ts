export const PDF_FILE_ROLES = Object.freeze(["primary_pdf", "answer_key_pdf"] as const);
export type PdfFileRole = (typeof PDF_FILE_ROLES)[number];

export type PdfValidationFinding = Readonly<{
  code: string;
  detail: string;
}>;

export type PdfInspection = Readonly<{
  decision: "accepted" | "quarantined";
  normalizedFilename: string;
  findings: readonly PdfValidationFinding[];
  hasAcroForm: boolean;
}>;

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const FORBIDDEN_TOKENS = Object.freeze([
  ["pdf-javascript", /\/(?:JavaScript|JS)\b/i],
  ["launch-action", /\/Launch\b/i],
  ["pdf-open-action", /\/OpenAction\b/i],
  ["additional-actions", /\/AA\b/i],
  ["embedded-file", /\/(?:EmbeddedFile|EmbeddedFiles|Filespec)\b/i],
  ["rich-media", /\/(?:RichMedia|Movie|Sound)\b/i],
  ["external-action", /\/(?:GoToR|SubmitForm|ImportData)\b/i],
  ["xfa-form", /\/XFA\b/i]
] as const);

export function normalizePdfFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const base = value.replaceAll("\\", "/").split("/").at(-1)?.normalize("NFKC") ?? "";
  const stem = base.replace(/\.pdf$/i, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return stem ? `${stem}.pdf` : null;
}

export function isPdfFileRole(value: unknown): value is PdfFileRole {
  return typeof value === "string" && PDF_FILE_ROLES.includes(value as PdfFileRole);
}

export function inspectPdfUpload(input: Readonly<{
  filename: unknown;
  mimeType: unknown;
  bytes: Uint8Array;
  maxBytes?: number;
}>): PdfInspection {
  const findings: PdfValidationFinding[] = [];
  const normalizedFilename = normalizePdfFilename(input.filename) ?? "rejected.pdf";
  if (!normalizePdfFilename(input.filename) || typeof input.filename !== "string" || !/\.pdf$/i.test(input.filename)) {
    findings.push({ code: "invalid-filename", detail: "A normalized .pdf filename is required." });
  }
  if (input.mimeType !== "application/pdf") findings.push({ code: "invalid-mime", detail: "The declared MIME type must be application/pdf." });
  const maximum = input.maxBytes ?? MAX_PDF_BYTES;
  if (input.bytes.byteLength < 16 || input.bytes.byteLength > maximum) findings.push({ code: "invalid-size", detail: `PDF size must be between 16 and ${maximum} bytes.` });

  const prefix = new TextDecoder("latin1").decode(input.bytes.subarray(0, Math.min(input.bytes.length, 8)));
  const tail = new TextDecoder("latin1").decode(input.bytes.subarray(Math.max(0, input.bytes.length - 2048)));
  if (!prefix.startsWith("%PDF-")) findings.push({ code: "invalid-magic", detail: "The file does not begin with the PDF magic bytes." });
  if (!tail.includes("%%EOF")) findings.push({ code: "missing-eof", detail: "The PDF end marker is missing." });

  const source = new TextDecoder("latin1").decode(input.bytes);
  for (const [code, pattern] of FORBIDDEN_TOKENS) {
    if (pattern.test(source)) findings.push({ code, detail: `Prohibited PDF structure detected: ${code}.` });
  }
  if (/\b(?:MZ|PK\x03\x04)\b/.test(source.slice(0, 32))) findings.push({ code: "executable-container", detail: "Executable or archive magic bytes are prohibited." });

  return Object.freeze({
    decision: findings.length ? "quarantined" : "accepted",
    normalizedFilename,
    findings: Object.freeze(findings),
    hasAcroForm: /\/AcroForm\b/.test(source)
  });
}
