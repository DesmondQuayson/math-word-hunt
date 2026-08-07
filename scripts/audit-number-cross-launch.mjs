import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const web = join(root, "apps", "platform-web");
const secretName = "MATHNEXA_GAME_LAUNCH_SECRET";
const sentinel = "number-cross-mathnexa-test-secret-with-at-least-32-bytes";

function read(relative) {
  return readFileSync(join(root, relative), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`Number Cross launch security audit failed: ${message}`);
}

function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const signer = read("apps/platform-web/lib/games/protected-launch.ts");
const playerRoute = read("apps/platform-web/app/games/[resourceId]/launch/route.ts");
const adminRoute = read("apps/platform-web/app/admin/games/catalog/[catalogId]/preview/route.ts");

assert(signer.startsWith('import "server-only";'), "signer is not guarded as server-only");
assert(signer.includes(`process.env.${secretName}`), "signer does not read the managed server secret");
assert(!signer.includes(`NEXT_PUBLIC_${secretName}`), "signing secret has a public alias");
const playerHandler = playerRoute.indexOf("export async function GET");
const adminHandler = adminRoute.indexOf("export async function GET");
assert(playerRoute.indexOf('requireProductAccess("/games")', playerHandler) < playerRoute.indexOf("createNumberCrossLaunchUrl", playerHandler),
  "player authorization must precede signing");
assert(adminRoute.indexOf("inspectAdminAccess()", adminHandler) < adminRoute.indexOf("createNumberCrossLaunchUrl", adminHandler),
  "Admin authorization must precede preview signing");
assert(signer.includes('new URL("/api/launch", game.launch.url)'), "launch endpoint is not fixed server-side");
assert(signer.includes('setAudience(NUMBER_CROSS_GAME_ID)'), "audience is not fixed to Number Cross");
assert(signer.includes('setExpirationTime(now + NUMBER_CROSS_LAUNCH_TTL_SECONDS)'), "token lifetime is not bounded");

for (const path of files(join(web, "components")).concat(files(join(web, "app")))) {
  if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(path))) continue;
  const source = readFileSync(path, "utf8");
  assert(!source.includes(secretName), `browser-facing source references ${secretName}: ${path}`);
}

for (const path of files(join(web, ".next", "static"))) {
  const content = readFileSync(path);
  assert(!content.includes(Buffer.from(secretName)), `client build contains the secret variable name: ${path}`);
  assert(!content.includes(Buffer.from(sentinel)), `client build contains the signing-secret sentinel: ${path}`);
}

console.log("Number Cross launch security audit passed: authorization precedes signing, destination and claims are fixed, and no client artifact exposes the secret contract.");
