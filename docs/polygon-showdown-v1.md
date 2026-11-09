# Polygon Showdown V1 — DRAFT / OWNER REVIEW

A free MathNexa geometry game. Swap neighbouring shapes to make lines of three or more; matched shapes break, the shapes above fall, new ones refill, and any line that forms by itself is a cascade. Signed-in players build permanent progress in Solo and spend virtual Polygon Coins on avatar cosmetics. Anyone can join a live Showdown with a room code.

Status: **catalog DRAFT, local owner review only.** Nothing is published, listed or reachable on a hosted deployment (see [Availability](#availability)). "Polygon Showdown" is a working name pending a final trademark and branding review.

The gameplay concept is match-three, a long-established genre. All artwork, interface, colours, animation, sound and code here are original to MathNexa.

| | |
| --- | --- |
| Game | `/games/polygon-showdown/play` (hub `#home`, `#solo`, `#continue`, `#create`, `#showdown`, `#shop`, `#avatar`, `#catalog`) |
| Players | `/join` (the QR opens `/join?code=482391`: the room is already identified) |
| APIs | `POST /api/games/polygon-showdown/account`, `POST /api/games/polygon-showdown/play` |
| Store | `supabase/migrations/20261109100000_polygon_showdown.sql` |
| Runtime | `apps/platform-web/public/internal-games/polygon-showdown/` (vanilla ES modules, like the other internal games) |
| Server authority | `apps/platform-web/lib/games/polygon-showdown/server.ts` |

## How it plays

The board is 8 × 8. A game starts with **Circle, Triangle, Square, Rectangle**, and the **Pentagon** joins as it goes. A shape is identified by its outline, never its colour alone, and the Rectangle is drawn about two to one so it cannot be mistaken for a Square (`engine/shapes.js`; tests classify every shape from its geometry). The Pentagon is a regular five-sided polygon, read aloud as "Pentagon — five-sided polygon". Hexagon, Rhombus, Trapezoid and Octagon are already drawn for later.

### How the Pentagon arrives

A new player meets four shapes. The Pentagon comes afterwards, a little at a time, into new shapes only: nothing already on the board ever changes.

| Mode | Warm-up on four shapes | Then |
| --- | --- | --- |
| Solo | 10 successful swaps | A wave every 70 swaps, lasting 10 swaps |
| Showdown, Standard (the default) | The first 60 seconds of the room's clock | A wave every 110 seconds, lasting 15 seconds |
| Showdown, Challenge | None | All five shapes, in every column, from the first move |

| Wave | New shapes in its lane that become Pentagons | Most Pentagons on the board |
| --- | --- | --- |
| First | 20% | 4 |
| Second | 30% | 6 |
| Third and every one after | 40% | 8 |

Each wave falls through a lane of three neighbouring columns, and the lane moves from wave to wave. Three details follow from how a rare shape behaves:

- **There is a ceiling.** A shape that is rare rarely lines up, so it piles up. In simulation, a plain 5% of new shapes reached 12% of the board and cost a third of the coins. Share alone could not meet the target of a 10 to 20% fall in earnings.
- **There are waves, and a lane.** Pentagons kept close together can be cleared. A plain ceiling of 4 gave one Pentagon match per 140 swaps; waves in a lane give one per 40 at the same cost in coins.
- **Showdown follows the clock, not progress.** A schedule counted in a player's own matches would make the board harder for whoever is ahead. The room's clock is the same for every seat, and the server replays it.

Each drawn value is a shape plus a roll from 0 to 99 (`kind + 16 × roll`). The roll decides whether the Pentagon takes that place once its share has grown past the roll. The rolls are fixed by the seed, so every seat has the same draws, and the schedule is stored with the game's state.

Opening boards are dealt until they offer 18 to 34 legal swaps (closest of 40 deals). A board is never dealt solved or with a ready-made match, and the free reshuffle is unchanged. A hint appears after 14 seconds without a move.

| Event | Polygon Coins |
| --- | --- |
| A normal match of 3 | 1 |
| Your swap clears 4 / 5 or more | +1 / +2 |
| Cascade link 2, 3, 4, 5+ (COMBO ×2…) | 2, 3, 4, 5 for that step's first match; 1 for any other match in the step |

A swap with no match goes back. A shape entering from the top never completes a line by itself (four shapes would otherwise cascade endlessly), so a cascade always comes from shapes falling into place. If no legal swap remains, the same shapes are rearranged for free and play goes on; there is no game over. Solo ends only when the player ends the run.

## Architecture

```
browser ── runs the shared engine so a swap answers at once
   │  POST same-origin JSON: swaps only, never results ([a, b, t], batched)
   ▼
app/api/games/polygon-showdown/{account,play}
   • replays every swap through the same engine, on the server's copy of the game
   • whitelists every browser payload field by field (the seed never leaves)
   ▼
Postgres functions (SECURITY DEFINER, service_role only)
   • identity, the clock, wallet, ledger, purchases, rooms
```

- **Engine** (`src/engine/*.js`, shared by browser, server and tests): pure functions over (state, swap, refill stream). No DOM, no clock, no `Math.random`.
- **Browsers** render and send swaps. A browser's own coin total is never read.
- **Database** owns money and time. Every function is `SECURITY DEFINER`, `search_path=''`, EXECUTE for `service_role` only; RLS is forced and `anon`/`authenticated` hold no grants.

### Determinism and fairness

Each game has one secret 128-bit seed. The opening board comes from the seed, and each column has its own fixed endless refill sequence from it. In a Showdown everyone gets the same opening board and draws from the same sequences at their own pace, so nobody's random numbers are easier: the creator, a late joiner and everyone else start from the same opportunity. Boards diverge as players decide differently, which is the game.

The browser is told only the next 40 shapes per column (`refillWindow`), never the seed. Reshuffles derive only from the board and the reshuffle count, so they need no secret.

### Anti-cheat

Every batch is replayed in `replayMoves`; the first swap that breaks a rule stops the batch, the moves before it stand, and the browser is put right by the server's state.

| Threat | Defence |
| --- | --- |
| Fabricated coin totals | Coins are computed from replay; a browser's number is not an input |
| Fake matches, invalid cascades | Each swap must be adjacent and make a real match; cascades are computed, never reported |
| Impossible swap rates | `t` must leave room for the previous move to resolve (`minGapAfter`, 150 ms + 180 ms per cascade link); the browser waits at least as long |
| Saved-up moves | A swap may be at most 45 s old and 1.5 s ahead of the server's clock |
| Duplicate events | Batches carry `from`; a retry skips what is applied. Ledger entries have a unique idempotency key |
| Manipulated seeds | Seeds are generated and kept on the server |
| Post-timer scoring | `t` must be within the Showdown; a batch more than 2.5 s after the buzzer is refused, by the app and again in SQL |
| Bots at full speed | The rate limit above, plus a 15,000-coin daily banking cap per account |

## Identity and progress

| | Signed-in Solo | Signed-in in a Showdown | Guest (code or QR) |
| --- | --- | --- | --- |
| Permanent progress | Yes | Validated reward only | No |
| Wallet, shop, avatar | Yes | Yes (their own) | No |
| Rules | n/a | Same as everyone | Same as everyone |
| Reconnect | Any device | Any device | This room, while it lasts |

- Permanent records key on the internal user id (`auth.users.id`), never a name or email, and are removed with the account.
- **No student accounts are introduced.** Long-term progress is for existing MathNexa account holders, consistent with the platform's public promise.
- A **school access session has no user id**, so it is a guest for progression: it can open the game, create a room and play a practice run that lives only in its tab. No wallet or inventory is ever created from an access code.
- Anonymous visitors are sent to sign in, as for every free MathNexa game (`authenticated-free`); no anonymous Solo exception was added.

### Saving

Solo saves on meaningful events, never per frame: after moves accumulate (at most every few seconds), at milestones, on a reshuffle, before a purchase visit, on run end, and when the page is hidden or closed (`keepalive`). Coins are banked to the wallet in batches (every 25 coins or 30 s, or at any checkpoint) and any remainder is banked on the next visit. A run opened in a second window takes over; the first is told so.

### Wallet

`polygon_ledger` records every change (`EARN_SOLO`, `EARN_SHOWDOWN`, `PURCHASE_ITEM`) with the balance after it. The application role can insert but not update or delete it. A balance cannot go negative (check constraint). A purchase is one transaction: charge, ledger line, ownership. The price is read from the database's own copy; retries with the same key charge once, and an owned item cannot be bought twice.

## Showdown

The creator is **Player-Host**: participant #1, playing from the same tab. There is no separate host dashboard; a small `⋯ Showdown Controls` menu offers Lock Joining, Players, Remove Player, End Showdown and Sound/Music. Pause is deliberately omitted: a paused board could be studied by the player who paused it.

```
LOBBY ─Start→ COUNTDOWN (5 s, server clock) → ACTIVE (5–30 min) → COMPLETE
```

- Phases derive from server timestamps on every read, so the buzzer needs no background job.
- Creator commands need **both** the signed-in session (keyed owner hash) **and** the current host token. A room code grants nothing. A new device signed in as the creator can take over, which retires the old tokens.
- Guests get a random 256-bit seat token in `sessionStorage`; refresh restores the same seat, board and score. A recent seat is offered as "Rejoin as Ava", never automatically.
- Late joiners, if joining is unlocked, start from the opening board with zero coins and the time left.
- Winner: most Showdown coins. Tiebreakers are things a player did (score, best combo, largest clear); still equal means a shared place.
- A signed-in player's validated Showdown coins convert at 50 % to permanent coins, capped at 40 per minute of the Showdown, once, when the room finalises.
- Rooms expire 30 minutes after the buzzer; names, emoji, scores and boards are deleted with them.

### Load design

No swap touches the room row. Each sync reads one player row and the room, then compare-and-swaps that player's row. Standings are refreshed about once a second by one reader (`for update skip locked`); everyone else reads the last copy. Players receive the top five plus their own place.

## One join page for every live game

`/join?code=…` asks `live_room_game_for_code`, and the code decides which game's screen answers. A code typed on the existing screen that belongs to a Showdown returns `other-game` before it can count as a failed Bingo code, and the player continues with what they typed. A six-digit code identifies one open room across all live games (`private.live_room_code_guard`, a trigger on `bingo_rooms`, with a shared advisory lock). Math Bingo Live's functions and existing codes are unchanged.

## Shop and avatar

153 items in 15 slots with fictional MathNexa names. Skin tones are always free and are not shop items. Every slot a complete avatar needs has free choices, and all ten natural hair styles are free. Nothing is locked to a frame. Virtual cosmetics only: no real-money purchases in V1.

The 3D renderer is a separate download reached through a dynamic import on the hub (deferred until idle, skipped under Save-Data) and the shop. Gameplay screens never import it; a test enforces this. The shop itself is also a separate download, so Solo and Showdown never pay for it.

Shop cards show still renders of the real 3D items (see [asset provenance](./polygon-showdown-asset-provenance.md)). One WebGL stage serves the whole shop: choosing a card shows that item turning on the stage, Try On puts it on the avatar with the camera moved to suit it, and the card grid stays pictures.

The avatar turns once every 10 seconds in the shop and editor. Dragging or using the rotate buttons pauses the turn for 3 seconds of idle. Under `prefers-reduced-motion` it stays still and the buttons still work. Frames are capped near 30 fps and stop entirely when the stage is off-screen or the tab is hidden.

### Economy simulation

`scripts/polygon-showdown-economy-simulation.mjs` plays timed sessions through the real engine, including animation time. See the owner review for the current table.

## Accessibility

Keyboard: the board is 64 real buttons with one tab stop; arrows move, Enter picks up, an arrow swaps, Esc cancels. Touch: tap-tap or drag. Visible focus ring; live-region announcements; each cell labels its row, column and shape. Reduced motion removes flying tiles, particles and floating numbers while keeping the same rules. Shapes differ by geometry. Forced-colours mode is supported.

## District network requirements

Players need only `https://mathnexa.com`: documents, scripts, styles, API and the shared music file are same-origin. No WebSocket, third-party realtime host, CDN, iframe, or remote audio or images. Ordinary HTTPS about once every 1.2 s per device, which is also the leaderboard's cadence.

## Audio

Music: **"Cosmic Candy Catchers (Looping)" by Eric Matyas (www.soundimage.org), CC BY 3.0**, the existing verified same-origin MathNexa copy. In a Showdown only the creator's device plays music by default; a player can opt in. Effects (swap, invalid swap, match, break, fall, cascade, combo, coin, countdown, finish, purchase, equip) are synthesized at runtime: original, no files.

## Availability

`isPolygonShowdownAvailable()` serves the game only if the catalog entry is `published`, or it is `draft` and the local owner preview is on: `MVH_POLYGON_SHOWDOWN_PREVIEW=local-owner-review`, a loopback application origin, and no Vercel deployment variables. A hosted environment can therefore never expose the draft, whatever its variables. The draft catalog card (`#catalog`) exists only under the same local preview.

## Running it

```
node scripts/run-polygon-showdown.mjs demo
node scripts/run-polygon-showdown.mjs e2e
node scripts/run-polygon-showdown.mjs load
node scripts/polygon-showdown-economy-simulation.mjs
node scripts/polygon-showdown-fairness-simulation.mjs
```

## Release plan (requires owner approval)

1. Owner review of this branch.
2. Trademark and branding review of the name.
3. Merge with the catalog entry still DRAFT; apply the migration to staging, then production (additive: new tables and functions, one draft catalog row, one trigger on `bingo_rooms`).
4. Staging verification on real devices and a school network, including a hosted load test at 50 players.
5. Publish with Super Admin → Games → Publish.
6. Rollback: set the entry to `archived` (routes stop serving new rooms and runs).
