# Math Bingo Live — final gameplay (STAGING ONLY, 2026-11-06)

**Status: on staging for your review. Production untouched (v1.2.35 published; no production migration, no catalog
change, no Supabase change). Nothing pushed or merged.**

| | |
| --- | --- |
| Branch | `feature/math-bingo-live-final-gameplay` |
| Base | `4439c14` (`perf/math-bingo-live-50` HEAD: `4ef3a61` deal-every-card-at-Start + its owner-review doc commit) |
| Staging preview | `dpl_FGkAjVyDarL9ic3CLdxXLmfu7jvP` — https://mathnexa-platform-staging-280c9v0wn-bright-path-ed-tech.vercel.app (build `4a456be`) |
| Staging database | `20261103100000`, `20261106100000`, `20261106110000`, `20261106120000`, **`20261107100000` (new)** |
| Production database | `20261103100000` only (unchanged) |

The 50-student performance work is all kept: cards are still dealt for every joined student inside Start / Play Again
(one request, `bingo_host_start` with boards), ordinary taps still touch only the student's own row, adaptive polling,
trimmed student replies and the host sign-in reuse are unchanged.

## What changed

### 1. No question repeats in a game

**Root cause.** The deck was three passes over the 24 card values; each pass re-used the least-used question for a
value, so a value with few questions came back with the same question (e.g. `1 + 0`), and in Fraction Bingo every
fraction had exactly one question, so each fraction was called about 7 times a game.

**Fix.** Every question has a canonical identity: `addition:5:7` is both `5 + 7` and `7 + 5` (likewise
multiplication), `subtraction:14:6` and `division:36:6` keep their order, `fraction:2:3` is the exact fraction. The
deck uses each identity once:

- Pass 1 still calls every card value (two 18s get two different questions), so a winner is always reachable.
- Later passes are second chances with questions not asked yet; a value whose questions are used up is not called
  again. Decks are therefore shorter (about 24–75 questions by level); when the deck runs out the game ends as before
  ("Every question was called"). Nothing is recycled behind the teacher's back.
- A card value never gets more copies than it has different questions, so each copy can be called by its own question.
- **Fraction Bingo** calls each fraction once: 10 questions at Halves to fifths, 15 at sixths, 22 at eighths. A card can
  still hold two models of 2/3, so cards are now dealt so that no row/column/diagonal holds more copies of a fraction
  than can ever be called; every line stays completable and choosing which copy to mark is real strategy.
- Different questions may share an answer: `7 + 5` and later `8 + 4` are both 12 and both allowed — the second 12 on a
  card is used by the second question.
- **Server authority, one structure.** Start refuses any deck in which an identity repeats or disagrees with its
  question (text, operands, canonical order, answer, mode), a question matches no card value, or a card value can never
  be called (`private.bingo_deck_valid`). The Called history every screen shows *is* the deck up to the current
  question, so the history and the no-repeat rule cannot drift. Play Again builds a new deck (a question may come back
  in the next game).

### 2. Every player's answers are independent

**Root cause.** The database never shared an answer between players: every mark is keyed by the player's own row and
checked against that player's own card, and the only unique indexes are room code, host token, player token, active
name per room and placement per room — nothing like `room + question`. The defect was on the student page: replies can
arrive out of order, and a poll that left *before* a student's tap but came back *after* another player's broadcast
(Free Space, "one away", Bingo — these change the room version) replaced the student's newer state. Their marked
square went blank and the card reopened; tapping again was refused ("That square is already marked" / "You already
marked a square for this question") until the next poll. That looks exactly like "I can't select my answer after
someone else did".

**Fix.** The page now keeps the newest room state and the newest own-seat state separately (`reconcile` in `api.js`),
re-deriving "mark used" for the question on screen; requests time out (10–12 s) instead of freezing the card; an
unexpected refusal re-syncs at once. When the winner limit ends the game mid-question (an existing rule), students now
see "The Bingo winners are in — this game is over." instead of "Wait for the next question."

One called question still gives each student exactly one normal mark: with two 12s, Ava marks one for `6 + 6` and her
second 12 for a later `8 + 4`.

### 3. QR joining (numeric code kept)

Lobby: **JOIN MATH BINGO LIVE**, a large QR, **OR** `mathnexa.com/join` and the **CODE**. Live board: a compact QR
beside the code in the header (tap it for a large one), so Winning Ways, standings, winners, question, Called and the
controls keep their space. **JOINING LOCKED** replaces all of it while joining is locked. The QR is this screen's own
origin + `/join?code=…`: staging opens staging, production opens `https://mathnexa.com`, and a hosted screen can never
encode localhost. It is drawn in the browser by a small built-in QR encoder — no QR service, district-network safe.
Scanning opens the join page with the room already identified: name, optional emoji, JOIN GAME.

### 4. Emoji with names

Optional, 33 curated choices (🐶 🐱 🦁 🐯 🐼 🐸 🐵 🐧 🦊 🐙 🚀 🌟 ⭐ 🌙 🌈 ⚡ 🔥 💎 ⚽ 🏀 🏈 ⚾ 🎾 🍕 🍎 🍉 🍓 🍩 📚 ✏️ 🎨 🧠 🧩),
🎲 Random (a different one each press) or none. Checked by the server and by the database (allowlist + constraint);
stored with the seat, so it survives refresh and reconnect without asking again. Shown in the lobby, standings
(`1 🦁 Ava 4/5 · Row`), Bingo Winners, one-away, `🐼 OMAR USED FREE SPACE!`, `🚀 ZION — BINGO!` and the podium. Two
students may share an emoji; the participant id is what identifies a player. Removing a player clears it.

### 5. Free Space lock and teacher standings (inspected, not changed)

Free Space must append an announcement that every screen shows, and it can complete a Bingo; announcements, winner
placement and the winner cap all live on the room row and are ordered by its lock. Making Free Space participant-scoped
would mean moving announcements to their own table and a new "unchanged" signal for students — the broad rewrite you
asked me not to do for a benchmark. Kept as is. The teacher standings read path was also left unchanged.

## Results

RESULTS_PLACEHOLDER

## Real-phone check on staging

1. On the laptop, open the staging link above, sign in with your staging MathNexa account, open Math Bingo Live
   (`/games/math-bingo-live/host`) and create a game.
2. On the phone, open the staging link once first and sign in to Vercel if it asks (staging previews are protected).
3. Scan the QR on the laptop with the phone camera: the join page opens with the game already chosen.
4. Type a name, pick an emoji (or 🎲 Random), JOIN GAME.
5. Start; answer on the phone while other devices answer the same question; watch the Called list for repeats.

## Rollback

Staging only: `supabase/rollback/math_bingo_live_final_gameplay.sql` restores the previous functions and removes the
emoji column; the previous staging preview `dpl_5ombzwsgyArmYnsdh5Zm9ikxQq5Y` (`4ef3a61`) needs that rollback first
(its decks have no identities, which the new Start refuses).

Nothing goes to production without your approval.
