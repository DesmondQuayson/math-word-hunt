// Where students join: the link behind the teacher's QR code and the
// "mathnexa.com/join" text. It is always the origin this teacher screen was
// served from, so a staging preview's QR opens that staging preview and a
// local review opens the local server — a QR can never point at a different
// environment (and never at localhost from a hosted screen). Production is
// always the canonical mathnexa.com origin (PRODUCTION_ORIGIN), also when the
// teacher opened www.mathnexa.com.

const PRODUCTION_HOSTS = new Set(["mathnexa.com", "www.mathnexa.com"]);
export const PRODUCTION_ORIGIN = "https://mathnexa.com";
const CODE = /^[1-9]\d{5}$/;

/** The origin students should open, from a Location-like { host, origin }; null if unusable. */
export function joinOrigin(location) {
  const host = String(location?.host ?? "").toLowerCase();
  if (PRODUCTION_HOSTS.has(host)) return PRODUCTION_ORIGIN;
  const origin = String(location?.origin ?? "");
  return /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(origin) ? origin : null;
}

/** <origin>/join?code=537636 — the room already identified. */
export function joinLink(code, location) {
  const origin = joinOrigin(location);
  if (!origin || !CODE.test(String(code))) return null;
  return `${origin}/join?code=${code}`;
}

/** What the screen prints for students to type: "mathnexa.com" or this host. */
export function joinHostLabel(location) {
  const host = String(location?.host ?? "").toLowerCase();
  return PRODUCTION_HOSTS.has(host) ? "mathnexa.com" : host;
}

/** A room code from a /join URL's ?code=, or "". */
export function codeFromSearch(search) {
  const raw = new URLSearchParams(String(search ?? "")).get("code") ?? "";
  return CODE.test(raw) ? raw : "";
}
