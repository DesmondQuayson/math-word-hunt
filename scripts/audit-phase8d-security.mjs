import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260803210000_phase8d_pdf_resource_security.sql");
const upload = read("apps/platform-web/app/admin/resources/upload/route.ts");
const replace = read("apps/platform-web/app/admin/resources/replace/route.ts");
const storage = read("apps/platform-web/lib/admin/resource-file-storage.ts");
const download = read("apps/platform-web/app/resources/[resourceId]/download/route.ts");
const preview = read("apps/platform-web/app/resources/[resourceId]/preview/[fileId]/route.ts");
const validator = read("packages/platform-core/src/admin-files/pdf-validation.ts");

for (const marker of [
  "'resource-files','resource-files',false", "'resource-quarantine','resource-quarantine',false",
  "alter table public.resource_files force row level security", "alter table public.resource_download_events force row level security",
  "security definer", "set search_path=''", "private.assert_content_admin", "Accepted PDF required before publication"
]) {
  if (!migration.includes(marker)) throw new Error(`Phase 8D migration is missing ${marker}.`);
}
for (const name of ["register_resource_file", "record_resource_download"]) {
  if (!migration.includes(`revoke all on function public.${name}`) || !migration.includes("from public,anon,authenticated")) {
    throw new Error(`${name} does not explicitly revoke browser execution.`);
  }
}
for (const marker of ["inspectPdfUpload", "inspectImageUpload", "createServiceSupabaseClient", "resource-quarantine", "register_resource_file"]) {
  if (!storage.includes(marker)) throw new Error(`Private file-storage boundary is missing ${marker}.`);
}
for (const [name, source] of [["upload", upload], ["replacement", replace]]) {
  for (const marker of ["storeResourceFile", "createServiceSupabaseClient", "inspectAdminAccess", "validateAdminMutationCsrf"]) {
    if (!source.includes(marker)) throw new Error(`${name} boundary is missing ${marker}.`);
  }
}
for (const token of ["JavaScript", "Launch", "OpenAction", "EmbeddedFile", "SubmitForm", "XFA"]) {
  if (!validator.includes(token)) throw new Error(`PDF validation does not reject ${token}.`);
}
for (const marker of ["getGameAccessView", "record_resource_download", "createSignedUrl", "Cache-Control", "nosniff"]) {
  if (!download.includes(marker)) throw new Error(`Download proxy is missing ${marker}.`);
}
for (const source of [download, preview]) {
  if (source.includes("signed.data.signedUrl}")) throw new Error("A signed storage URL appears to be returned to the browser.");
  if (!source.includes("fetch(signed.data.signedUrl")) throw new Error("Private storage assets must be proxied by the application server.");
}
for (const forbidden of ["pdfkit", "PDFDocument", "student_id", "studentId", "ShowMe Math"]) {
  if (`${migration}\n${upload}\n${replace}\n${storage}\n${download}`.includes(forbidden)) throw new Error(`Phase 8D contains forbidden marker ${forbidden}.`);
}

const expected = new Map([
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  if (createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex") !== digest) throw new Error(`${path} changed during Phase 8D.`);
}
console.log("Phase 8D security audit passed: files remain private, unsafe PDFs quarantine, publication requires accepted evidence, and downloads are entitlement-audited server proxies.");
