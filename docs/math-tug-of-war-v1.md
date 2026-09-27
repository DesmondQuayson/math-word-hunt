# Math Tug of War V1

A new MathNexa classroom game: two sides answer math questions at the same
time; every correct answer pulls the rope one step toward the answering side.
The rope is the score. No timer, no difficulty levels, no tutorial.

Branch `feature/math-tug-of-war-v1` from `origin/main` `fc0cfb7` (release
v1.2.15, production runtime `2532244`, mathnexa.com = `dpl_3DUHT7Lcfy1VvGWStF9JLGnnkyyN`).
Production is not changed by this branch.

## 1. Architecture audit (recorded before building)

| Concern | What exists | Decision for Tug of War |
| --- | --- | --- |
| Game registry | `lib/games/internal-registry.ts` (trusted internal games) + DB catalog `game_catalog_entries` (`launch_type='internal'`, trigger requires `internal_registry_key`/`internal_route`/`implementation_version`) | New key `math-tug-of-war`, route `/games/math-tug-of-war/play`, `connect-src 'self'` |
| Math Games page | `app/games/page.tsx` renders published catalog rows in `display_order`; artwork via `components/games/game-catalog-thumbnail.tsx` | Migration publishes the card (next free display order); authentic 1200×675 capture mapped in the thumbnail component |
| Runtime | Internal games are self-contained documents served as a raw HTML string by `app/games/[resourceId]/play/route.ts` under a strict route CSP (no framework chrome) | Vanilla ES modules in `public/internal-games/math-tug-of-war/`, document from `features/games/math-tug-of-war/document.ts` |
| Access | `/games` segment and the play route call `requireProductAccess("/games")`: MathNexa all-access subscription **or** a school access-code session. No free tier | Inherited at first; **superseded 2026-09-27 by the owner: Math Tug of War is free for any signed-in MathNexa account** (see §4a). Every other game keeps the rule |
| Music | One approved track, *Cosmic Candy Catchers* (Eric Matyas, CC BY 3.0), byte-identical copies per game; each game owns its audio lifecycle and a namespaced preference record | Reuses the shared `/media/audio/cosmic-candy-catchers.mp3` (no new audio file). Same lifecycle as Number Cross/Number Logic: gesture-started `play()`, loop, pause while hidden, release on `pagehide`. Preference record `mathnexa:math-tug-of-war:preferences` has Number Cross's shape |
| Sound effects | Web Audio tones in Number Cross | Same approach (button, correct, incorrect, pull, victory), respects the Sounds toggle |
| Fullscreen | Per game, `Permissions-Policy fullscreen=(self)` | "Classroom" button (Fullscreen API) |
| Analytics | `platform_analytics_events` is aggregate-only; no per-game events exist and nothing records `game-completion` | **None added.** No names or events leave the device for analytics |
| Persistence | Games store preferences in `localStorage` | Preferences only. Online seat (room code + bearer token) in `sessionStorage` for reload-reconnect |
| Supabase | Server clients (`createServerSupabaseClient`, service client); RLS forced + service_role-only SECURITY DEFINER RPCs; **Realtime is not used anywhere** (`[realtime] enabled = false` locally) | See §4 |
| CSP | Internal-game route CSP: `default-src 'none'`, `script-src 'self'`, `connect-src` per game. Locally `next dev` applies next.config headers over route headers (on Vercel the route wins) | Document uses absolute asset URLs (no `<base>`), so it renders under either policy |
| Tests | Vitest (lib/components/test), Playwright configs per game, mobile gameplay harness serving shipped documents with production CSPs, security baseline + bundle audit, pgTAP | New unit, pgTAP, harness e2e (local modes, 5 device projects) and two-client online e2e |

## 2. Game design

- **Skills (exactly six)**: Addition (1–12 + 1–12), Subtraction (1–12, first ≥ second),
  Multiplication (1–12 × 1–12), Addition & Subtraction of Integers (two operands in −12…12,
  one `+`/`−`, always involving a negative number or a negative answer; negative second
  operands are parenthesised: `5 + (−3)`), Opposite of Integers ("What is the opposite of −7?"),
  Absolute Value in two families (owner update 2026-09-27): about 60 % standard `|−8| = ?`
  (answer 0…12) and about 40 % negative-outside `−|−8| = ?` (answer −12…0; `−|0| = 0`).
  An absolute value is never shown as negative; only the sign outside the bars makes the
  answer negative. True minus sign (U+2212) everywhere; never negative zero.
- **Question streams** (`src/questions.js`): seeded (mulberry32), one stream per team, a
  six-question recent-repeat guard. `questionAt(skill, seed, index)` replays a stream — the
  Online Match server uses it so the browser never needs the answer.
- **Tug model** (`src/tug.js`): position −7…+7 from 0 (owner update 2026-09-27: 7 NET pulls
  to win); Turquoise (left) −1, Pink (right) +1; ±7 wins. Opposing pulls cancel progress.
  Wrong answers never move the rope; the team simply gets its next question. The raw number
  is never shown; screen readers hear "The match is even.", "Sharks is pulling ahead.",
  "Comets is close to winning.", "Sharks needs one more pull to win."
- **Scene geometry for 7 pulls**: 38 units per pull (was 40), teams packed closer, a wider
  field, and a camera that follows part of the tug (0.3 full-field, 0.65 zoomed) so all six
  competitors stay in frame at ±7 and every pull still moves visibly.
- **Robot** (`src/robot.js`): one robot, no difficulty. `ROBOT_TUNING` holds every constant
  (per-skill thinking time 3.0–4.6 s ± 35 %, minimum 1.8 s, 80 % accuracy, +0.6 s after a
  miss). It answers its own question through the same submit path as a person and only
  pulls when that answer is actually correct.
- **Keypad**: large custom keypad (no software keyboard). `+`/`−`/⌫ row for the three integer
  skills. The entry buffer can only ever hold a valid prefix, so `--7`, `+-7`, `7-` cannot be
  typed; `parseAnswer` also rejects them and normalises every dash look-alike.
  Keys activate on `pointerdown`, so two players on one Smart Board can press at the same instant.
- **Physical keyboard**: digits, `+`, `-`/`−`, Enter, Backspace, Delete. In Two Teams one key
  event goes to exactly one side: the side last touched/focused (shown by a "Keyboard" chip on
  pointer-fine devices).
- **Scene** (`src/scene.js`): original SVG competitors (three per team, team emblem wave/star so
  identity never relies on colour), rope with slack/taut states, gold centre ribbon, centre line,
  dashed victory lines with ground flags. A pull: winners lean back and step, rope tightens, losers
  jerk forward with a dust puff, the whole tug moves with a small recoil and settles (≈680 ms;
  rapid pulls queue at 360 ms so play never waits). Victory: winners cheer, losers fall forward,
  28 pieces of confetti fall once. The scene frames itself to the available space (full field on
  phones, closer on classroom boards).
- **Reduced motion**: no body/rope/confetti animation; the rope jumps to its new place, the
  status line ("Sharks pulled!") and the SVG title still say who pulled and where the rope is.
- **State**: screens `home → setup-* → game` plus `online-menu/create/join → lobby`; overlays
  `won`, `away` (opponent disconnected), `end`. Local matches are a small immutable engine
  (`playing`/`won`); online state is the server's.

## 3. Layouts

- Landscape (≥ 6:5): Turquoise panel | scene | Pink panel. On 1920×1080 keys are ~133×130 px.
- Portrait: scene on top; Two Teams side by side below; VS Robot / Online: compact opponent row
  and one full-width keypad.
- Short landscape phones: 4-column signed keypad, question and answer side by side.
- 200 % text: panels never shrink below their content; the game screen scrolls instead of clipping.

## 4. Online Match: architecture decision

**Chosen: same-origin authoritative HTTP API + Postgres row locks + short polling.**
Supabase Realtime was evaluated and not used:

1. It is not used anywhere in MathNexa today and is disabled in the local stack.
2. School access-code sessions have **no Supabase identity**, so browsers could only subscribe
   via anon access or newly minted JWTs — both widen the database's browser surface, which today
   is zero for game data.
3. The internal-game CSP allows only `connect-src 'self'`; Realtime needs `wss://<project>.supabase.co`.

The game polls `POST /api/games/math-tug-of-war/online` (700 ms while playing, 1.5 s otherwise,
slower when hidden). Only room state crosses the network; pull animation is local, driven by the
authoritative pull counters.

**Authority and security**
- The room's question seed is generated on the server and stored only in the database; the
  browser payload is built field by field (`toClientState`) and never contains the seed, answers,
  token hashes or database ids. The room code (5 characters from a 31-symbol alphabet without
  0/1/I/L/O) is the only identifier.
- Players hold a 256-bit bearer token (issued at create/join, kept in `sessionStorage`, stored
  server-side only as SHA-256). A token speaks for exactly one team.
- `tug_submit_answer` locks the room row (`FOR UPDATE`), accepts only the caller's **current**
  question index in the current round (replays, double taps and earlier rounds are `stale`),
  applies ±1 within bounds, sets the winner atomically and refuses pulls while the opponent has
  not been seen for 10 s. Two near-simultaneous correct answers are serialised by the lock and
  both count.
- The server decides correctness (`checkSubmission`) from its own regenerated question; extra
  fields such as `correct`, `position` or `winner` in a request are ignored.
- Requests must be same-origin (`Sec-Fetch-Site`/`Origin`), carry `X-MathNexa-Game`, be JSON,
  ≤ 2 KB, and pass the Math Games access rule. Tables `tug_rooms`/`tug_join_failures` force RLS
  with no browser grants; all six `tug_*` functions are SECURITY DEFINER, EXECUTE for
  service_role only.
- Abuse limits: 10 room creations per player per 10 min; 20 failed joins per player per 10 min
  (keyed by an HMAC of the access principal, never the principal itself).
- Lifetime: a waiting room expires after 20 minutes, a started match after 3 hours (+1 hour per
  rematch); expired codes can be reissued but an expired room is retired, never resurrected.
  Rows older than 24 hours are deleted on the next room creation. Names exist only in the room row.
- Presence: connected (< 6 s), reconnecting (6–30 s), disconnected (> 30 s → "Opponent
  disconnected" with **Wait** / **Return to Math Games**). No victory is ever awarded for a
  disconnect. Leaving closes the room; the other player sees "… left the match."
- Rematch: both players must press Play Again; the round increments, the rope resets and both
  question streams change (the round is part of the stream seed).

## 4a. Access: free with a MathNexa account (owner decision 2026-09-27)

- Policy `authenticated-free`, declared once in `apps/platform-web/lib/games/access-policy.ts`
  (`GAME_ACCESS_POLICIES`). Only `math-tug-of-war` is listed; every other game (and any unknown
  key) resolves to `entitled`. Reverting access = delete that one entry (and the
  `FREE_GAME_DESTINATIONS` entry in `lib/auth/access-intent.ts`); the Math Games badge follows the
  policy automatically, the homepage "Featured games" card in `teacher-first-home.tsx` is removed by hand.
- Who plays: a signed-in consumer whose account is `active` with a confirmed email (no
  subscription, trial state or payment state is consulted), or a school access-code session.
  Anonymous visitors go to `/access?next=/games/math-tug-of-war/play` (sign in or create an
  account, then return to the game); unconfirmed accounts to `/confirmation-required`;
  suspended / pending deletion / missing records to `/account`. Never pricing, checkout,
  subscription or trial. Helpers: `isSignedInFreePlayer`, `canPlayGame`,
  `requireGamePlayAccess` in `lib/access/server.ts`.
- The play route decides the policy from a static slug table **before** reading the catalog,
  and 404s if the catalog row for that slug is a different game.
- The return destination `/games/math-tug-of-war/play` is an exact entry in the server-owned
  intent allowlist (`FREE_GAME_DESTINATIONS`); it is not a product destination.
- Online Match API: `canPlayGame(access, "math-tug-of-war")` (401 otherwise). Server authority,
  tokens, rate limits and RLS are unchanged.
- `/games` (the Math Games page) stays entitled. A non-subscriber reaches the game from the
  homepage card or the direct link; the in-game exit goes **Home** for players without Math
  Games access and **Math Games** for those with it (`data-exit-href` on the document body).
- Homepage: "Featured games" section — Math Vocabulary Hunt, then Math Tug of War ("Free with a
  MathNexa account", **Play for Free Now**). Math Games page: "Free to play" badge + the same CTA.
- Analytics: MathNexa has no existing privacy-safe analytics pipeline, so no events were added.

## 5. Verification

| Gate | Command |
| --- | --- |
| Engine, generator audit (6 × 10,000), 10,000 match simulations, robot | `npm run test --workspace @math-vocabulary-hunt/platform-web -- lib/games/math-tug-of-war` |
| Online server authority + API route | same (`online.test.ts`, `online-route.test.ts`) |
| Runtime delivery (hash-versioned entry URLs, CSP, no raw-HTML sinks) | same (`runtime.test.ts`); refresh the hash with `node scripts/math-tug-of-war-runtime-hash.mjs --write` |
| Database (84 assertions: grants, lifecycle, replay, impersonation, expiry, throttle, 7-net-pull wins both ways, cancellation, bounds, leaving after a win) | `supabase/tests/database/34_math_tug_of_war.test.sql` |
| Local modes, 5 device projects (Chromium/WebKit desktop, Pixel 7, iPhone 13, iPad) incl. responsive 304–1920, 200 % text, axe, audio, reduced motion | `node scripts/run-math-tug-of-war-e2e.mjs` |
| Two real clients through the real API and DB (sync, simultaneous answers, win, rematch, disconnect/reconnect, reload, leave, failures, security, Chromium↔WebKit) | `node scripts/run-math-tug-of-war-online-e2e.mjs` (local Supabase with the migration applied) |
| Signed-in free access (anonymous flow, create account + email confirmation, sign in and return, access matrix, other games/products unchanged, two non-subscribers online, subscriber vs non-subscriber online, homepage 304–1920 + 200 % + axe) | `lib/games/access-policy.test.ts` and `e2e/math-tug-of-war/free-access.spec.ts` (run by the online runner) |
| Card artwork | `node scripts/capture-math-tug-of-war-thumbnail.mjs`; pinned by `scripts/audit-game-suite-media.mjs` |
| Staging database activation | `scripts/invoke-math-tug-of-war-staging.ps1 -Stage identify`, then (owner-approved) `-Stage apply` per migration (`$env:APPLY_MIGRATION`), then `-Stage smoke` and `-Stage review -Origin <preview>` |

## 6. Release notes for the owner (not done on this branch)

- Production requires BOTH migrations, in order: `20260927100000_math_tug_of_war.sql` and
  `20260928100000_math_tug_of_war_seven_pulls.sql` (7-pull bound and the fix that lets a won
  room be closed so the other player learns their opponent left). Apply them on the production
  database **and** a deployment of this branch. The migration publishes the card; an internal
  key that is not registered in the deployed build is dropped from the catalog, so applying the
  migration before the deployment cannot show a broken card.
- To withdraw the game: archive the catalog entry (admin catalog) — the route then 404s.
