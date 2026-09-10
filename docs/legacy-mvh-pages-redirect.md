# Legacy Math Vocabulary Hunt GitHub Pages redirect (BS-07B3)

Production bug sweep item **BS-07B3** (ShowMe repository, `docs/production-bug-sweep-2026-09.md`
on the `docs/production-bug-sweep-2026-09` branch).

## Two different things

| | Where | Role | Change |
| --- | --- | --- | --- |
| Canonical game document | `docs/index.html` on `main` (sha256 `7f00ed67…`, 113,537 bytes, pinned by 41 files) | Source of the production runtime: `/game/runtime/*` bundles `docs/index.html` and `docs/vocab.js` (`apps/platform-web/next.config.mjs`), served to signed-in players through `/play` → `/game/runtime/index.html?launch=<generation>` | **NONE** |
| Public GitHub Pages site | `https://desmondquayson.github.io/math-word-hunt/` (Pages source: branch `main`, path `/`) | Legacy standalone copy: the Jekyll README at the root (indexable, canonical to itself) and the standalone game at `/docs/` (`noindex`) | Replaced by a redirect stub to `https://mathnexa.com/games` |

Production never fetches the GitHub Pages host. `LEGACY_GAME_URL` (used only by the non-production
`/play` gateway) is not set on the production project, and `.env.production-public.example` is a stale
example.

## Architecture

- `pages-redirect/` on `main` (this directory) is the reviewed artifact: `index.html`, byte-identical
  `404.html`, empty `.nojekyll`.
- The dedicated orphan branch **`pages-redirect`** contains exactly those three files and nothing
  else. It is the future Pages source. `main` is never used as the redirect site: the application
  source, `docs/`, and `docs/index.html` stay untouched.
- The stub: `noindex, nofollow`; canonical `https://mathnexa.com/games`; one inline script that calls
  `location.replace("https://mathnexa.com/games")` and reads nothing from the URL (no pathname, query
  or fragment handling, so no open redirect); meta refresh to the same destination; visible
  "This standalone version has moved." with the link "Continue to MathNexa Games". No external
  resource, storage, cookie or service worker. Every legacy path (root, `/docs/`, deep or unknown)
  lands on `https://mathnexa.com/games`; signed-out visitors then follow MathNexa's own access flow.

## Checks

| Command | What it proves |
| --- | --- |
| `npm run check:mvh-pages-redirect` | `pages-redirect/` is exactly the stub and meets the contract; `docs/index.html` is byte-identical to the pinned runtime; a local `pages-redirect` branch matches `pages-redirect/` blob for blob. |
| `npm run test:mvh-pages-redirect` | Runs the shipped inline script against hostile window shapes: the destination is always the constant; nothing is read from the URL; the canonical file is untouched. |

## Owner action (not performed by preparation)

Switch the GitHub Pages source from `main:/` to `pages-redirect:/`. Settings → Pages → Build and
deployment → Branch `pages-redirect`, folder `/` (root); or the REST call below. GitHub then builds
the three-file branch and the redirect is live within a minute. Nothing on `main` changes, no
application deployment or Vercel action is triggered, and the hash pins are unaffected.

```bash
curl -X PUT -H "Authorization: Bearer <token with repo scope>" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/DesmondQuayson/math-word-hunt/pages \
  -d '{"source":{"branch":"pages-redirect","path":"/"}}'
```

## Rollback

Switch the Pages source back to branch `main`, folder `/` (same settings page or the same REST call
with `{"source":{"branch":"main","path":"/"}}`). The old site rebuilds from `main` unchanged, because
`main` was never modified for this cleanup.
