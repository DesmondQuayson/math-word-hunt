/**
 * Application-wide security response headers.
 *
 * Lives as `.mjs` because `next.config.mjs` has to import it before the
 * TypeScript pipeline exists. The security test suite imports the same module,
 * so the policy that ships and the policy that is asserted are one value.
 *
 * Scope note: several routes (`/game/runtime`, the ticketed game package
 * delivery, resource downloads and previews, the internal game documents)
 * send their own, stricter, per-response CSP. The runtimes never combine that
 * policy with this one; each serves ONE, and they pick in opposite directions:
 *
 *   - Vercel (production, staging): the function's header replaces the
 *     configured header of the same name, so those routes are served with
 *     their own policy only.
 *   - `next dev` / `next start` (Next.js 16, server/send-response.js): a
 *     route header is copied only if the configuration has not already set
 *     that name, so locally those routes are served with THIS policy instead.
 *
 * For most of those routes the local difference is harmless: this policy is
 * the looser one. It broke the internal game documents, whose `<base href>`
 * needs `base-uri 'self'`, and hid the game-package assets' own policy, so
 * under the development server only (where every game e2e suite runs)
 * `next.config.mjs` applies these headers to every path except the routes that
 * own their headers (`route-owned-headers.mjs`). Every build keeps the
 * unconditional `/:path*` rule: on Vercel a negative path match would leave
 * non-document answers on those paths without these headers. See
 * docs/security/internal-game-csp-parity.md.
 */

/**
 * `'unsafe-inline'` in `script-src` is required, not lazy: the Next.js App
 * Router emits inline bootstrap and RSC flight scripts on every document.
 * Removing it needs per-request nonces, which needs every HTML response to be
 * rewritten in `proxy.ts` and the nonce threaded through the root layout. That
 * is a real change to a frozen release, so it is tracked as a P1 follow-up
 * rather than smuggled into a hardening pass. `showme.mathnexa.com` ships the
 * same trade-off today.
 *
 * `style-src` needs it for the same reason (Next.js inlines critical CSS).
 *
 * `'unsafe-eval'` is added ONLY for the local development server
 * (`developmentServer`, which `next.config.mjs` derives from Next's
 * PHASE_DEVELOPMENT_SERVER, never from an environment variable), as the Next.js
 * CSP guide does. React's development build evaluates code to rebuild server
 * call stacks and logs "eval() is not supported in this environment" on every
 * page without it, which failed every local e2e suite that asserts a clean
 * console. `next build` (every Vercel deployment) never passes it, and
 * production React never uses eval.
 */
export function buildContentSecurityPolicy(source = process.env, { developmentServer = false } = {}) {
  const supabaseUrl = (source.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  let supabaseOrigin = "";
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      // Realtime session refresh uses a WebSocket against the same host.
      supabaseOrigin = `${parsed.origin} ${parsed.origin.replace(/^http/, "ws")}`;
    }
  } catch {
    // No browser Supabase client is configured; 'self' is the whole surface.
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${developmentServer === true ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Game audio and generated clips are served same-origin or as blobs.
    "media-src 'self' data: blob:",
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "worker-src 'self' blob:",
    // Games are framed same-origin inside a sandboxed iframe.
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    // Subscribing and opening the billing portal are form submissions (a server
    // action, and a POST to /admin/users/action) whose response redirects to
    // Stripe's hosted pages. Firefox — and Chrome, depending on version —
    // enforces form-action against the REDIRECT target as well as the initial
    // post, so a bare 'self' here would silently break checkout and the billing
    // portal. These two hosts are the only external form destinations the
    // product has; everything else, including any exfiltration target an
    // injected form might aim at, stays blocked.
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    // Clickjacking control. 'self' rather than 'none' because the game runtime
    // is legitimately framed by /games/[resourceId]; an attacker cannot host a
    // framing page on our own origin, so this still blocks the real attack.
    "frame-ancestors 'self'"
  ].join("; ");
}

export function buildSecurityHeaders(source = process.env, { developmentServer = false } = {}) {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(source, { developmentServer }) },
    // Vercel already sends max-age; includeSubDomains is the part that was
    // missing. showme.mathnexa.com already asserts includeSubDomains itself and
    // is HTTPS-only, so no sibling host regresses. `preload` is deliberately
    // omitted: it is a one-way door that needs an owner decision.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Legacy backstop for the CSP frame-ancestors directive above.
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "accelerometer=(), autoplay=(self), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), xr-spatial-tracking=()"
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" }
  ];
}
