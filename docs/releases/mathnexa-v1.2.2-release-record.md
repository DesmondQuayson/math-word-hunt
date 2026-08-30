# MathNexa v1.2.2 — Release Record

Owner-approved production release, frozen 2026-08-30 after the owner personally tested the
live site at https://mathnexa.com/ and confirmed both fixes.

## Release identity

| Item | Value |
| --- | --- |
| Release type | Branding + authentication-navigation hotfix |
| Tag | `v1.2.2` (annotated, object `56a85297d7e68d4415033d7a951161737bd7624c`) |
| Application source | `b13ce5e9b401d2f56673d6cfe4265254ab35f958` |
| Parent release | `v1.2.1` → `e92be67d3e7c28a587df50c406c49823358d74e5` (tag untouched) |
| Branch | `hotfix/mathnexa-favicon-post-login-home` |
| Vercel deployment | `gxboi6425` / `dpl_3TzpnfSH7isL6zziyHEymdMdPLky` on `bright-path-ed-tech/mathnexa-platform-production` |
| Production | https://mathnexa.com/ and https://www.mathnexa.com/ (308 to apex) |
| Previous production | `3oma7nduk` / `dpl_9Zpcwh1tUQXBjaLCKqxFaAZkdX5y` — the rollback target |

Unlike the ShowMe project, this project's custom domains are attached to the production
target, so both aliases moved with the deploy; that was verified, not assumed.

## Primary changes

**1. The first complete raster favicon / app-icon set for mathnexa.com**, using the
owner-approved MathNexa artwork.

The site previously declared exactly one icon, `app/icon.svg`, and `/favicon.ico` returned
404. Google Search does not accept an SVG-only favicon and falls back to `/favicon.ico`,
which is why the search result carried a generic globe. The favicon already shipped for
`showme.mathnexa.com` could not have helped — a different hostname served by a different
Vercel project from a different repository.

Ships `app/favicon.ico` (16 + 32 + 48, RGBA entries), `icon.png` 192, `icon1.png` 512 and
`apple-icon.png` 180. Every asset is byte-identical to the set ShowMe Math ships, so the two
hostnames now carry one brand identity; re-running the generator from the committed artwork
reproduces exactly those bytes. `app/icon.svg` was removed rather than kept beside them,
leaving App Router file conventions as the single authoritative icon system — which is also
what makes `/favicon.ico` resolve at the domain root. Tab icons keep the transparency
outside the mark's disc; the Apple icon stays opaque because iOS composites alpha against
black.

**2. A completed authentication journey now lands on Home (`/`) instead of `/account`.**

The cause was not one stray redirect. Seven independent places each spelled `"/account"` as
the consumer fallback: `signInAction`, `signUpAction`, `app/auth/callback/route.ts`, the
confirmation cookie written and read either side of email confirmation, the sign-in and
sign-up pages' authorized-code form, `school-access-actions`, and the confirmation dialog's
client-side `router.replace`. They now all read one constant, `POST_AUTH_DESTINATION = "/"`,
in `lib/auth/access-intent.ts`.

**3. A valid protected deep-link return still wins over the default.** Home is only the
fallback when there is no legitimate first-party destination.

**4. `/account` is untouched** and reachable whenever it is asked for. It is simply no
longer where signing in ends.

Home joined `ACCESS_INTENT_DESTINATIONS` so an explicit `next=/` is honoured rather than
silently rewritten. That widens a server-owned exact-match allowlist by one same-origin path
and relaxes nothing. Home was deliberately NOT added to `PRODUCT_DESTINATIONS`, where it
would let a product gate resolve to the marketing page.

The two changes are independent by construction: `proxy.ts`'s matcher excludes
`favicon.ico` and `*.png`, so authentication can never gate the icons and an icon failure
can never affect authentication.

## Verification at freeze

**Production identity.** `gxboi6425` is the newest deployment on the project, ● Ready, and
both `mathnexa.com` and `www.mathnexa.com` resolve to it. Of the 12 build assets the live
home page references, 9 exist under the same name in a local build of `b13ce5e` and **all 9
are byte-identical**; the remaining 3 are the Turbopack runtime and two env-dependent chunks
that Vercel builds with production configuration a local build does not have.

**Favicon, live.** `/favicon.ico` → 200, `image/vnd.microsoft.icon`, 8,030 bytes. All four
assets sha256-identical to the approved artwork:

| Asset | sha256 |
| --- | --- |
| `favicon.ico` | `00f915145067b3fa19348a472990f04de19e9acbdca376d88f399f2ce619291a` |
| `icon.png` | `e267aab0100f54c41b12c26700134242cde48382b3145704a86d6566419e73a7` |
| `icon1.png` | `87dc71683ffa6ccec8abf42b3a3f24baa891103af3ad864c9cd1b079a0bc4001` |
| `apple-icon.png` | `18d171daf6c0f51db6227014ff954e2fac20a7e6632910e2314dbcfdb2de11cf` |

The `.ico` carries three RGBA entries at 16, 32 and 48. `icon.png` and `icon1.png` carry
transparency; `apple-icon.png` does not. `/icon.svg` returns 404. All four `<link>` tags
appear on Home, Sign in, Games, MAP Prep, Homework, Quizzes and Account. Headed Chromium
fetched the approved 8,030-byte ICO on all seven routes in fresh contexts; WebKit and
Chromium both decode all four at declared size with the transparency contract intact.
Playwright's WebKit renders no tab strip on Windows, so a real Safari tab render was not
claimed.

**Authentication, live.** `/sign-in` renders `next="/"`. Deep links `/games`, `/account`,
`/homework`, `/quizzes` and `/map-prep` are all preserved. Every hostile target collapses to
`/` and is never followed: `https://attacker.example`, `//attacker.example`,
`javascript:alert(1)`, `data:text/html,x`, `%252Fgames`, `%2F%2Fattacker.example`,
`https://mathnexa.com.evil.test/`, `/admin`, `/games/../admin`, `/games%23launch`,
`/games%3Fentitlement%3Dactive`, `/%20`.

A note for future readers: `?next=%2Fgames` resolves to `/games`. That is Next URL-decoding
the query before the guard sees it, so the guard receives a legitimately-encoded allowlisted
same-origin path. It is not a bypass — the genuinely hostile double-encoded `%252Fgames` is
refused.

**Route smoke, signed out.** Home, Sign in, Sign up, About, Help and Accessibility return
200. Games, MAP Prep, Homework, Quizzes, Account, Pricing and Subscription redirect once to
`/access?next=…`; Game access redirects once to `/sign-in?next=/game-access`. Every route
settles at 200 in at most one hop — no redirect loops. `robots.txt` and `sitemap.xml` return
200 and no disallow prefix matches any icon path.

**Gates.** typecheck 0 · lint 0 errors (8 pre-existing warnings) · unit 291 passed / 293 ·
production build green (175 routes) · `npm audit --omit=dev` 0 vulnerabilities.

The single unit failure is the known Windows-CRLF checkout artifact in
`lib/game-access/canonical-assets.test.ts`: it hashes `docs/index.html`, whose LF-normalised
sha256 equals the approved baseline
`7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5` exactly, and the affected
source is unchanged since `v1.2.1`. Documented in the v1.2.1 release record; green on CI.

## Not in this release

Nothing from ShowMe Math / MAP Prep. `showme.mathnexa.com` is a different project and was
not touched, and the pending `release/map-prep-v1.2.2-favicon` work is untouched and
untagged.

## Google Search follow-up

Technical favicon eligibility is complete: root `/favicon.ico` returns 200 without cookies
or a redirect, the homepage carries a valid icon declaration, the icons are square rasters
of at least 48 pixels on stable URLs, and neither the homepage nor any icon path is
disallowed to Googlebot or Googlebot-Image.

**Google Search may continue showing its previous generic favicon until it recrawls.** That
is crawler latency, not an application defect. Owner follow-up when desired:

1. Google Search Console → URL Inspection
2. Inspect `https://mathnexa.com/`
3. Request indexing

## Rollback

Redeploy the previous production deployment `3oma7nduk`
(`dpl_9Zpcwh1tUQXBjaLCKqxFaAZkdX5y`, source `e92be67` = v1.2.1) via Vercel's instant
rollback. Tags are never moved. Rolling back restores the SVG-only favicon and the
`/account` sign-in landing.
