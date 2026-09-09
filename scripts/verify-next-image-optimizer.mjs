// Image Optimization regression harness for the Next.js 16.3.4 security hotfix.
//
//   node scripts/verify-next-image-optimizer.mjs --write-fixtures
//   <start `next start` — it indexes public/ at boot, so fixtures must exist first>
//   node scripts/verify-next-image-optimizer.mjs --base=http://127.0.0.1:3000 --fixtures
//   node scripts/verify-next-image-optimizer.mjs --clean-fixtures
//   node scripts/verify-next-image-optimizer.mjs --base=https://mathnexa-platform-staging.vercel.app
//
// --write-fixtures writes BENIGN malformed and truncated AVIF fixtures (a bare
// `ftypavif` header, a PNG under an .avif name, an empty file, a box with an
// absurd declared length) into public/__image-fixtures/ so the optimizer can
// be asked to process them; --fixtures probes them; --clean-fixtures removes
// them. They are never valid AVIF, never weaponized, and never committed.
// Without --fixtures the harness probes only assets the application ships.
//
// What "safe failure" means here: the server keeps answering, the response is
// a controlled status (2xx pass-through or a 4xx refusal) rather than a crash,
// and no error page leaks internals.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const base = (args.get("--base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const withFixtures = args.has("--fixtures");
const fixtureDirectory = resolve("apps/platform-web/public/__image-fixtures");
if (args.has("--clean-fixtures")) {
  rmSync(fixtureDirectory, { recursive: true, force: true });
  console.log("fixtures removed");
  process.exit(0);
}

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
function box(type, payload = Buffer.alloc(0), declaredLength) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(declaredLength ?? 8 + payload.length);
  return Buffer.concat([length, Buffer.from(type, "latin1"), payload]);
}
const fixtures = {
  "valid.png": PNG_1X1,
  // ftyp only: an AVIF that ends before any meta or mdat box.
  "truncated.avif": box("ftyp", Buffer.from("avif\0\0\0\0avifmif1", "latin1")),
  // A meta box that declares 2 GiB of content and delivers 4 bytes.
  "oversized-box.avif": Buffer.concat([box("ftyp", Buffer.from("avif\0\0\0\0avifmif1", "latin1")), box("meta", Buffer.from([0, 0, 0, 0]), 0x7fffffff)]),
  // PNG bytes served with an AVIF name and content type.
  "png-as.avif": PNG_1X1,
  "empty.avif": Buffer.alloc(0),
  "garbage.avif": Buffer.from("not an image at all, just text pretending to be avif")
};

const image = (url, width = 64) => `${base}/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
async function probe(label, url, init = {}) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(url, { redirect: "manual", headers: { accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, ...init });
  } catch (error) {
    return { label, url: url.replace(base, ""), status: "NETWORK-ERROR", detail: String(error.message).slice(0, 120), ms: Math.round(performance.now() - started) };
  }
  const body = Buffer.from(await response.arrayBuffer());
  return {
    label,
    url: url.replace(base, ""),
    status: response.status,
    type: response.headers.get("content-type"),
    bytes: body.length,
    cache: response.headers.get("x-nextjs-cache") ?? response.headers.get("x-vercel-cache"),
    location: response.headers.get("location"),
    leak: /at .*node_modules|Error: |stack|sharp\(/i.test(body.toString("latin1").slice(0, 2000)),
    ms: Math.round(performance.now() - started)
  };
}

if (args.has("--write-fixtures")) {
  mkdirSync(fixtureDirectory, { recursive: true });
  for (const [name, bytes] of Object.entries(fixtures)) writeFileSync(resolve(fixtureDirectory, name), bytes);
  console.log(`fixtures written to ${fixtureDirectory}`);
  process.exit(0);
}

const results = [];
// Legitimate, shipped assets: root icon, brand mark, game thumbnails.
results.push(await probe("shipped icon (png)", image("/icon.png", 64)));
results.push(await probe("shipped icon (png, 256)", image("/icon.png", 256)));
results.push(await probe("shipped brand mark (png)", image("/brand/mathnexa-mark.png", 128)));
results.push(await probe("shipped game thumbnail (webp)", image("/media/games/number-cross.webp", 384)));
results.push(await probe("shipped game thumbnail (avif, static)", `${base}/media/games/number-cross.avif`));
results.push(await probe("shipped game thumbnail (avif via optimizer)", image("/media/games/number-cross.avif", 384)));
// Refusals that must hold regardless of version.
results.push(await probe("remote url refused", image("https://example.com/a.png")));
results.push(await probe("protocol-relative refused", image("//example.com/a.png")));
results.push(await probe("traversal refused", image("/../../etc/passwd")));
results.push(await probe("missing file", image("/does-not-exist.png")));
results.push(await probe("width not allowed", image("/icon.png", 7)));
results.push(await probe("no url", `${base}/_next/image?w=64&q=75`));
if (withFixtures) {
  // Each fixture must be served as-is first (proves it is really there), then
  // be handed to the optimizer.
  for (const name of Object.keys(fixtures)) {
    results.push(await probe(`fixture served ${name}`, `${base}/__image-fixtures/${name}`));
    results.push(await probe(`fixture optimized ${name}`, image(`/__image-fixtures/${name}`, 64)));
  }
  // The server must still be healthy afterwards.
  results.push(await probe("post-fixture health (icon)", image("/icon.png", 64)));
}

let failures = 0;
for (const result of results) {
  const status = String(result.status);
  const okForLabel =
    /refused|traversal|no url|width not allowed/.test(result.label) ? status.startsWith("4") :
    /missing file/.test(result.label) ? status.startsWith("4") :
    /fixture served/.test(result.label) ? status === "200" :
    /fixture optimized (truncated|oversized|png-as|empty|garbage)/.test(result.label) ? /^(2|4)\d\d$/.test(status) && !result.leak :
    /^2\d\d$/.test(status) && !result.leak;
  if (!okForLabel) failures += 1;
  console.log(`${okForLabel ? "ok  " : "FAIL"} ${status.padEnd(6)} ${String(result.type ?? "").padEnd(24)} ${String(result.bytes ?? "").padStart(7)}B ${String(result.ms).padStart(5)}ms  ${result.label}${result.leak ? "  !! internals leaked" : ""}${result.location ? `  -> ${result.location}` : ""}`);
}
console.log(`\n${results.length} probes, ${failures} failed`);
process.exitCode = failures ? 1 : 0;
