# CSP Nonce Feasibility (MN-08)

**Recommendation: DEFER. Keep `'unsafe-inline'` in `script-src` and `style-src`.**

This is a real investigation, not a shrug. The conclusion is that the change
costs more than it buys *for this codebase*, and the reasons are specific enough
to be re-checked when Next.js changes.

## Why `'unsafe-inline'` is there

| Source | Needs inline? | Notes |
|---|---|---|
| Next.js App Router bootstrap | **Yes** | Emits inline `<script>` on every document to boot the client runtime |
| React Server Components flight payload | **Yes** | Streamed as inline `self.__next_f.push(...)` script chunks |
| Next.js critical CSS | **Yes** (`style-src`) | Inlined `<style>` blocks |
| React inline `style` attributes | **Yes** (`style-src`) | Style attributes need `'unsafe-inline'` unless `'unsafe-hashes'` is used |
| Stripe | No | Checkout is a server-issued 303 navigation; no browser SDK is loaded |
| Supabase | No | `@supabase/ssr` browser client is a bundled module, not inline |
| Game runtime | Serves its **own** CSP | `lib/games/delivery.ts` builds a per-response policy |
| Third-party scripts | **None exist** | No external script, font, frame or analytics provider is loaded |

That last row matters: the application loads nothing from a third-party origin,
so the usual strongest argument for a strict CSP — containing a compromised
vendor script — does not apply here.

## What a nonce would cost

A nonce must be per-request, which means:

1. `proxy.ts` generates it and passes it via a request header.
2. The root layout reads that header and puts it on every framework script tag.
3. **Reading a per-request header makes the route dynamic.** Every page that is
   currently statically generated — the marketing surface, `/about`, `/help`,
   `/accessibility`, `/privacy`, `/terms`, `/pricing` — becomes server-rendered
   per request.

That is the disqualifying cost. It trades measurable, universal latency and
cache efficiency on the public surface for a defence-in-depth improvement.

`style-src` cannot be dropped independently either: React sets style attributes,
which need `'unsafe-inline'` (or `'unsafe-hashes'`, which is worse).

## What is being defended against, and whether it exists

`script-src 'unsafe-inline'` matters when an attacker can get markup into a page.
The application has **zero** such sinks:

- `dangerouslySetInnerHTML` — **0 occurrences**
- `.innerHTML =` — **0 occurrences**
- `document.write` — **0 occurrences**
- No Markdown rendering, no user-generated HTML, no template injection surface

A standing test walks `app/`, `components/` and `lib/` and fails if any appear.
So `'unsafe-inline'` is currently a gap in a wall around an empty room. It is
worth closing eventually — defence in depth is exactly about the sink you have
not written yet — but not at the cost of the public surface's rendering model.

## Alternatives considered

**Hash-based CSP.** Rejected: the framework's inline content changes with every
build and includes per-page flight data, so the hash set is neither stable nor
enumerable.

**Nonce on documents only, keeping static pages exempt.** Rejected: a
mixed policy means the header differs by route, which is the kind of subtlety
that decays into a hole. The gate is either uniform or it is not trustworthy.

**`strict-dynamic`.** Depends on a nonce or hash to bootstrap, so it inherits the
same problem.

## Re-check when

- Next.js ships first-class nonce support that does not force dynamic rendering.
- The application gains its first raw-HTML rendering path — at which point this
  stops being defence in depth and becomes load-bearing, and the trade flips.
- A third-party script is introduced.

Until one of those, the honest position is that the current policy — which does
carry `object-src 'none'`, `base-uri 'none'`, a constrained `form-action` and
`frame-ancestors 'self'` — is proportionate, and the effort is better spent on
the items in the security debt register.

`showme.mathnexa.com` ships the same trade-off.
