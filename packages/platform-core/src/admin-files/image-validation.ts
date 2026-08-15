export type ImageInspection = Readonly<{
  decision: "accepted" | "quarantined";
  normalizedFilename: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | null;
  width: number | null;
  height: number | null;
  findings: readonly string[];
}>;

const PNG_SIGNATURE = [137,80,78,71,13,10,26,10] as const;

function normalizedImageFilename(value: unknown, extension: string): string | null {
  if (typeof value !== "string") return null;
  const base = value.replaceAll("\\", "/").split("/").at(-1)?.normalize("NFKC") ?? "";
  const stem = base.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return stem ? `${stem}.${extension}` : null;
}

function jpegDimensions(bytes: Uint8Array): readonly [number, number] | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]!;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) return null;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return [(bytes[offset + 7]! << 8) | bytes[offset + 8]!, (bytes[offset + 5]! << 8) | bytes[offset + 6]!];
    }
    offset += 2 + length;
  }
  return null;
}

export function inspectImageUpload(input: Readonly<{ filename: unknown; mimeType: unknown; bytes: Uint8Array }>): ImageInspection {
  const findings: string[] = [];
  let mimeType: ImageInspection["mimeType"] = null;
  let extension = "bin";
  let dimensions: readonly [number, number] | null = null;
  const bytes = input.bytes;
  if (bytes.length >= 24 && bytes.slice(0,8).every((value,index) => value === PNG_SIGNATURE[index]!)) {
    mimeType = "image/png"; extension = "png";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    dimensions = [view.getUint32(16),view.getUint32(20)];
  } else if (bytes.length >= 12 && bytes[0]===0xff && bytes[1]===0xd8) {
    mimeType = "image/jpeg"; extension = "jpg"; dimensions = jpegDimensions(bytes);
  } else if (bytes.length >= 30 && new TextDecoder("latin1").decode(bytes.slice(0,4))==="RIFF" && new TextDecoder("latin1").decode(bytes.slice(8,12))==="WEBP") {
    mimeType = "image/webp"; extension = "webp";
    if (new TextDecoder("latin1").decode(bytes.slice(12,16))==="VP8X") dimensions = [1+bytes[24]!+(bytes[25]!<<8)+(bytes[26]!<<16),1+bytes[27]!+(bytes[28]!<<8)+(bytes[29]!<<16)];
  }
  const normalizedFilename = normalizedImageFilename(input.filename, extension) ?? "rejected.bin";
  if (bytes.length < 24 || bytes.length > 8*1024*1024) findings.push("invalid-size");
  if (!mimeType) findings.push("invalid-magic");
  if (mimeType && input.mimeType !== mimeType) findings.push("mime-mismatch");
  if (!dimensions || dimensions[0] < 1 || dimensions[1] < 1 || dimensions[0] > 8192 || dimensions[1] > 8192) findings.push("invalid-dimensions");
  return Object.freeze({ decision: findings.length ? "quarantined" : "accepted", normalizedFilename, mimeType,
    width: dimensions?.[0] ?? null, height: dimensions?.[1] ?? null, findings: Object.freeze(findings) });
}
