const REDIRECT_STATUSES = new Set([302, 303, 307, 308]);

function redirectUrl(status, location, baseUrl) {
  if (!REDIRECT_STATUSES.has(Number(status))) throw new Error("phase10-map-prep-redirect-status");
  if (typeof location !== "string" || location.length === 0 || location.length > 2048) {
    throw new Error("phase10-map-prep-redirect-location");
  }
  try { return new URL(location, baseUrl); }
  catch { throw new Error("phase10-map-prep-redirect-location"); }
}

function exactUrlParts(actual, expected, code) {
  if (actual.protocol !== expected.protocol || actual.hostname !== expected.hostname ||
      actual.port !== expected.port || actual.pathname !== expected.pathname ||
      actual.search !== expected.search || actual.hash !== expected.hash ||
      actual.username || actual.password) throw new Error(code);
}

export function assertMapPrepLaunchRedirect({ status, location, origin }) {
  const expected = new URL("/map-prep/launch", origin);
  const actual = redirectUrl(status, location, origin);
  exactUrlParts(actual, expected, "phase10-map-prep-launch-mismatch");
  return actual.href;
}

export function assertMapPrepDestinationRedirect({ status, location, origin, expectedDestination }) {
  const expected = new URL(expectedDestination);
  if (expected.protocol !== "https:" || expected.username || expected.password) {
    throw new Error("phase10-map-prep-expected-destination-unsafe");
  }
  if (typeof location !== "string" || !location.startsWith("https://")) {
    throw new Error("phase10-map-prep-destination-mismatch");
  }
  const actual = redirectUrl(status, location, origin);
  exactUrlParts(actual, expected, "phase10-map-prep-destination-mismatch");
  return actual.href;
}

export function assertMapPrepRedirectSafe({ values, secrets }) {
  for (const value of values) {
    const text = String(value ?? "");
    if (secrets.some((secret) => secret && text.includes(secret))) {
      throw new Error("phase10-map-prep-redirect-secret-exposure");
    }
  }
  return true;
}
