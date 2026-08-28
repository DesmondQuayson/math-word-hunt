# Math Vocabulary Hunt — Natural Voice Audit & Architecture (V1.2.1)

Audited at `v1.2.0` (`787fc21`) before any change. The canonical game
(`docs/index.html` + `docs/vocab.js`) is byte-frozen behind sha256 gates, so the upgrade is
delivered through the sanctioned runtime-enhancement pipeline — the same injection point
that already adds the stylesheet, music adapter, credits, and Back-to-Games link. **Game
bytes, gameplay, scoring, timers, placement, and progression are untouched.**

## Previous voice system (the robotic voice)

- Engine: `window.speechSynthesis` — raw browser TTS, `rate 1.05 / pitch 1.15` for phrases,
  the OS default en-US voice picked via `voiceschanged` caching. That is the robotic sound.
- Trigger inventory (complete):
  - `speakSelectedTerm(entry.display)` — the found/selected term name (bank mode), with
    music ducking before speech and duck-restore wired to `utterance.onend/onerror`.
  - `speakText(nextPraise())` on a correct find — 6 rotating praise phrases.
  - `speakText("Puzzle complete! Great teamwork!")` on round completion.
  - Nothing else speaks. **Definitions, instructions, and tutorial content are text-only
    today** (definitions display on the find card) — that behavior is preserved.
- Cancel path: `cancelSpeech()` bumps a sequence counter and calls `speechSynthesis.cancel()`.
- Gates: speech only in `soundMode === "full"` (modes full / tones / muted); music has its
  own modes (low / medium / off) with WebAudio `musicGain` ducking. Controls preserved as-is.
- Problems: robotic voice quality; OS-dependent voice choice; awkward pitch/rate; no
  guarantee of pronunciation consistency.

## New architecture (prebuilt natural audio)

```
game event → speakText / speakSelectedTerm (unchanged game code)
  → window.speechSynthesis.speak(utterance)        [game's own call]
  → /game-suite/natural-voice.js adapter           [injected in <head>, runs first]
      normalize(utterance.text)
      → /game-suite/voice/manifest.json lookup     [same-origin]
      → play prebuilt MP3 once                      [Chirp 3: HD, en-US-Chirp3-HD-Aoede]
      → fire utterance.onend                        [game's duck-restore runs as before]
```

- **Provider:** Google Cloud TTS, Chirp 3: HD, `en-US-Chirp3-HD-Aoede` — the voice class
  already approved for ShowMe Math. Generation is offline tooling
  (`scripts/generate-mvh-voice.mjs`) using the git-ignored `GOOGLE_TTS_CREDENTIALS`
  service account; **no credential exists in the repository, bundle, HTML, or browser** —
  shipped artifacts are plain MP3s + a JSON manifest.
- **Corpus:** 506 unique term display names + 6 praise phrases + 1 completion phrase
  = 513 clips, keyed by exact normalized phrase. Definitions: 0 required (not narrated
  today; behavior preserved).
- **Delivery:** first-party origin only (`mathnexa.com/game-suite/voice/…`) — no runtime
  TTS API, no third-party host, school-network friendly, zero per-play cost.
- **Loading:** manifest fetched lazily on first speech; the 7 recurring phrases preload
  after the first user interaction; term clips fetch on demand and cache in-memory.
  Nothing preloads hundreds of files.
- **Lifecycle:** exactly one clip at a time; a new speak or `cancel()` stops the previous
  clip and fires its `onerror` (sequence-guarded restore in the game makes this safe);
  `pagehide` cancels; hidden tab pauses, visible resumes; clips never loop; replay only
  happens when the game itself speaks again.
- **Ducking:** unchanged and automatic — the game ducks before calling speak and restores
  on `onend/onerror`, which the adapter fires at real clip boundaries.
- **Autoplay:** speech is always user-action-driven in this game (selections/finds), so
  clip playback happens post-gesture; the adapter also warms on first pointer/key event.
- **Fallback policy:** a phrase without a clip (or a failed play) stays **silent** — the
  term/definition text is always visible, so gameplay never blocks — and the diagnostic
  flips to `silent`. Browser speech synthesis is never invoked: robotic fallback = 0 by
  construction.
- **Diagnostics:** `document.documentElement[data-voice-source]` = `prebuilt` | `silent`.
- **Sound controls:** untouched — `full` speaks naturally, `tones` and `muted` behave
  exactly as before (the game gates speech before the adapter is ever involved).

## Accessibility

Voice remains supplementary: every spoken phrase (term names, praise, completion) is also
visible text in the game. No audio-only instructions were added. The adapter does not touch
focus, ARIA, or reduced-motion behavior, and does not interfere with screen readers (it
replaces only the game's own TTS calls).
