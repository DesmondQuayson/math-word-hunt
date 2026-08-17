# Game suite media provenance

## Background music

- Title: **Cosmic Candy Catchers (Looping)**
- Author: Eric Matyas
- License: [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)
- Source page: [OpenGameArt](https://opengameart.org/content/cosmic-candy-catchers-looping)
- Required credit: `"Cosmic Candy Catchers" by Eric Matyas — www.soundimage.org`
- Acquisition date: 2026-08-16
- Original filename: `cosmic_candy_catchers_0.ogg`
- Original OGG size: 4,453,735 bytes
- Original OGG SHA-256: `23556fd5ab4f17351811b845f2d420df1ce6d8bc27ededff1c7bb58c6325c4bc`

The original was acquired from the cited OpenGameArt entry and hashed before integration. It is not shipped because normal game playback does not need a 4.45 MB second format. The runtime MP3 is OpenGameArt's derivative of the same approved recording; the composition, pitch, and tempo were not altered.

| Runtime format | Size | SHA-256 | Browser role |
| --- | ---: | --- | --- |
| MP3 (`audio/mpeg`, OpenGameArt derivative `cosmic_candy_catchers.ogg.mp3`) | 1,024,417 bytes | `6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369` | Safari/macOS, Safari/iPadOS, Chromium, and Smart Board browsers |

Every current runtime copy has the derivative hash above. Number Logic and CrossCalc V2 retain their established asset filenames. The CrossCalc V2 release bundle and MP3 remain byte-identical, with playback corrected by an additive platform-owned runtime adapter. Number Logic keeps its generator, solver, scoring, persistence, and MP3 bytes intact; a deterministic integration patch updates its tutorial and user-gesture audio lifecycle, with a conditional same-origin HTMLMedia fallback only where Web Audio is unavailable. Number Cross uses the descriptive `cosmic-candy-catchers.mp3` filename. Math Vocabulary Hunt uses `/media/audio/cosmic-candy-catchers.mp3` through the authenticated canonical runtime adapter. No game fetches OpenGameArt or SoundImage during play.

## Catalog thumbnails

All catalog assets are exact 1200×675 derivatives with no stretching. The Math Vocabulary Hunt owner artwork was resized with `scripts/prepare-game-suite-thumbnails.mjs`. The initially supplied Number Logic and Number Cross artwork was rejected during owner review because it contained malformed or incorrect decorative arithmetic; neither rejected image is shipped. Those two thumbnails are deterministic captures of the real local, entitled production UI created by `scripts/capture-authentic-game-thumbnails.mjs` and encoded with the same AVIF/WebP quality contract.

| Game | Reviewed source | WebP size / SHA-256 | AVIF size / SHA-256 |
| --- | --- | --- | --- |
| Math Vocabulary Hunt | Owner artwork · 1,786,099 bytes · `c2063c594123290539ef95ee9daac360a5bfdb0180a70d4d36c81c3951c375d6` | 104,550 bytes · `2b731f5f46a7cbe72b10fb9f54345957ea6c90ca3cfdf9640ed9e2b33e3a3991` | 50,653 bytes · `8aed591e1643875ac15e02911473e3854e39077961d0c7dd66b8cd6ad4141021` |
| Number Logic | Authentic `Lines of 3` Beginner state, generated and solver-validated locally | 29,582 bytes · `740f5321b17afea9d2240f032d83f9f85b56b3e0dcd21d29fb0184640335995e` | 18,208 bytes · `2c1285d2703de0cbb013dc59e14aa4a9afbc0ae3d746226baef776759c8f7d74` |
| Number Cross | Authentic Addition Easy 4×4 state, uniquely generated and validated locally | 28,066 bytes · `90dc23fc0d10efe209f67c8c56cd704bfb1b7c557ac8255c33104134a440b489` | 18,194 bytes · `54674951a8f3b738597e45feeda71a6b7b98454d83c5cb330bb4171e4d971067` |

CrossCalc V2 keeps its approved 1200×675, 82,090-byte WebP (`6b55119f38b1445941c5470ddad34f17276f06ab72502b01ae666bdf1558377d`).

### Content review and release gate

- Math Vocabulary Hunt communicates the connected word-grid mechanic and correctly spells the canonical v7 terms `FRACTION`, `INTEGER`, `RATIO`, `AREA`, and `EQUATION`. No definition or clue is readable in the artwork, so it makes no unverified definition claim.
- Number Logic shows the actual `Lines of 3` board after two solver-backed moves. Its completed routes are true (`7 + 5 + 9 = 21` and `5 + 6 + 10 = 21`). The three unfinished routes use the game's honest `?` placeholder, do not claim equality, and remain `PROVEN_POSSIBLE`.
- Number Cross shows the actual 4×4 cross-out mechanic. Only cells excluded by the unique solution are crossed; five targets are correctly solved, the remaining targets are still open, and none is impossible. The audit recomputes every solution row and column from the production engine.
- CrossCalc V2 remains the approved real-game capture and is byte-identical to the benchmark asset.

`scripts/game-suite-thumbnail-content.mjs` is the explicit reviewed fixture. `npm run test:game-suite:media` regenerates the Number Cross fixture through the real engine, proves uniqueness, validates every visible completed Number Logic equation, verifies canonical vocabulary definitions, and pins all reviewed asset hashes. The capture command refuses non-loopback application or Supabase origins, fails on any remote runtime request, uses a temporary adult local fixture, and deletes it after capture.

The artwork is integrated only on the isolated review branch. Production catalog metadata and Production thumbnails are unchanged.
