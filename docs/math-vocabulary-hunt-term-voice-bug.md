# Math Vocabulary Hunt — "the voice never says the word" (root cause & fix)

## Symptom (owner, staging)
On a correct find the natural voice played praise ("Nice find, Chief!") but never the
vocabulary term itself.

## Root cause — traced in the frozen game (`docs/index.html`)

The game never requests term speech on the find path:

```
markFound(placement)                    // the correct-find handler
  → playCorrectAudio()                  // tones + speakText(nextPraise(), 220ms)  ← PRAISE ONLY
  → showFindCard(entry, team)           // $("#findTerm").textContent = entry.display
```

- `speakSelectedTerm(entry.display)` exists ONLY in bank mode (word-bank selection), not on
  grid finds — and even there, any praise that follows routes through `speakText`, whose
  220 ms timer calls `cancelSpeech()` and cuts the term off mid-word.
- So under the original robotic voice the term was also absent/cut on finds; the natural
  adapter faithfully reproduced that existing behavior. Not a manifest/mapping failure:
  all 506 term clips exist and resolve (coverage gate), the praise clip that played proves
  the pipeline worked — the game simply never asked for the term.

## Fix (adapter-level; frozen game bytes untouched, hash gates stay green)

`showFindCard` writes the found term into `#findTerm` synchronously in the SAME event tick,
220 ms before the praise speak arrives. The adapter uses that first-party signal:

```
speak(text) arrives
  ├─ text ∈ PRAISE set → read #findTerm → SEQUENCE: [term clip] → 160ms gap → [praise clip]
  │    (term deduped per find-card instance: one pronunciation per find, ever)
  ├─ text = completion phrase → play alone (no term prepend)
  └─ text ∈ term manifest (bank mode) → play the term; a praise that follows for the same
       term skips the duplicate pronunciation instead of canceling it
```

- Newest-wins interruption: a NEW find (praise with a different `#findTerm`) stops the old
  sequence cleanly and speaks the new term exactly once. No backlog queue beyond the
  current term→praise pair.
- Duplicate-event guard: an identical speak request while the same sequence is active
  (double listeners, rerenders, pointer+key double events) is dropped; per-find term
  pronunciation count is hard-capped at 1.
- No loops: clips play once; `onend` never re-queues the same content; replay only occurs
  when the game emits a new speech event.
- Ducking: the game still ducks before praise and restores via the utterance's
  `onend/onerror`, which the adapter fires at the END of the full sequence — so music stays
  lowered through term + praise and restores once, smoothly (no pumping, no mid-sequence
  restore).
- Diagnostics: `data-last-spoken-term`, `data-voice-source` (prebuilt | silent),
  `data-voice-state` (playing | idle).

## Term mapping (deterministic)

Manifest keys ARE the canonical vocabulary keys: `entry.display` is the `TERMS` object key
verbatim, and clips are keyed by the whitespace-normalized display. Gate results:
506/506 mapped, 0 missing, 0 normalization collisions (verified: no two displays collapse
to the same normalized key), praise/completion classified by a fixed 7-phrase set.
