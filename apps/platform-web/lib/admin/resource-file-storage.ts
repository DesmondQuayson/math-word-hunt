import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { inspectImageUpload, inspectPdfUpload } from "@math-vocabulary-hunt/platform-core";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

type ServiceClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
type ResourceFileRole = "primary_pdf" | "answer_key_pdf" | "thumbnail" | "preview_image";

export async function storeResourceFile(input: Readonly<{
  client: ServiceClient;
  adminId: string;
  resourceId: string;
  resourceVersion: number;
  role: ResourceFileRole;
  upload: File;
  replacesFileId?: string | null;
}>) {
  if (input.upload.size > 20 * 1024 * 1024) return { decision: "quarantined" as const, stored: false };
  const bytes = new Uint8Array(await input.upload.arrayBuffer());
  const isPdf = input.role === "primary_pdf" || input.role === "answer_key_pdf";
  const pdfInspection = isPdf ? inspectPdfUpload({ filename: input.upload.name, mimeType: input.upload.type, bytes }) : null;
  const imageInspection = isPdf ? null : inspectImageUpload({ filename: input.upload.name, mimeType: input.upload.type, bytes });
  const decision = pdfInspection?.decision ?? imageInspection!.decision;
  const accepted = decision === "accepted";
  const bucket = accepted ? "resource-files" : "resource-quarantine";
  const prefix = accepted ? "resources" : "quarantine";
  const normalizedFilename = pdfInspection?.normalizedFilename ?? imageInspection!.normalizedFilename;
  const objectPath = `${prefix}/${input.resourceId}/v${input.resourceVersion}/${randomUUID()}-${normalizedFilename}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const detectedMime = isPdf ? "application/pdf" : imageInspection!.mimeType ?? "application/octet-stream";
  const uploaded = await input.client.storage.from(bucket).upload(objectPath, bytes, {
    contentType: accepted ? detectedMime : "application/octet-stream", upsert: false, cacheControl: "private, max-age=0"
  });
  if (uploaded.error) throw new Error("Private resource upload failed.");
  const report = pdfInspection
    ? { validator: "phase8d-pdf-structure-v1", findings: pdfInspection.findings, acroform: pdfInspection.hasAcroForm, malware_scan: "structural-fail-closed" }
    : { validator: "phase8d-image-magic-v1", findings: imageInspection!.findings, width: imageInspection!.width, height: imageInspection!.height, malware_scan: "structural-fail-closed" };
  const registered = await input.client.rpc("register_resource_file", {
    p_actor_admin_id: input.adminId,
    p_resource_id: input.resourceId,
    p_resource_version_number: input.resourceVersion,
    p_file_role: input.role,
    p_original_filename: input.upload.name.slice(0, 255),
    p_normalized_filename: normalizedFilename,
    p_bucket_id: bucket,
    p_object_path: objectPath,
    p_mime_type: accepted ? detectedMime : "application/octet-stream",
    p_byte_size: bytes.byteLength,
    p_sha256: sha256,
    p_validation_state: accepted ? "accepted" : "quarantined",
    p_validation_report: report,
    p_replaces_file_id: accepted ? input.replacesFileId ?? null : null
  });
  if (registered.error) {
    await input.client.storage.from(bucket).remove([objectPath]);
    throw new Error("Resource validation evidence could not be registered.");
  }
  return { decision, stored: true, fileId: registered.data as string };
}
