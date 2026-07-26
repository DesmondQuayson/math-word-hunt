# Current Product Architecture

Status: current v7 implementation. Future platform work is described separately
and is not part of this architecture.

## Runtime

Math Vocabulary Hunt is a static browser application:

- docs/index.html contains the document structure, styles, game engine, screen
  navigation, word-grid generator, input handling, scoring, timer, modals, and
  audio system.
- docs/vocab.js contains the canonical TERMS dictionary, CURRICULUM hierarchy,
  term-to-grid resolver, lesson builder, and curriculum audit.
- No build step, framework, backend, database, account, analytics service, or
  external gameplay API is required.
- Game and score state is held in memory and resets when the page reloads.

## Content model

TERMS defines each unique display term once with a student-facing definition,
an optional example, and optional placement metadata. CURRICULUM references
those term keys through grade, topic, and lesson records.

The game resolves lesson terms into:

- full words that fit the grid;
- distinguishing anchor words for long or ambiguous phrases; or
- clue-only bonus cards when no safe grid representation exists.

Startup checks verify the expected grades and playable-lesson counts and block
startup when a nonrecoverable content-integrity problem is found.

## Gameplay

The current release supports:

- Grades 6, 7, and 8
- topic and lesson navigation
- two to four named classroom teams
- regular lessons, topic challenges, and combined lessons
- generated word-search grids in eight directions
- Word Bank and Clue modes
- tap-to-select and continuous Pointer Event tracing
- word definitions, examples, scoring, bonus definitions, timer, reveal hint,
  new puzzle, score reset, and fullscreen controls
- a final review screen after all placeable terms are found

## Accessibility

The product currently provides:

- semantic buttons, headings, form labels, and breadcrumb navigation
- a keyboard-operable word bank and grid
- arrow-key movement between grid cells
- visible focus styling
- live regions for status and progress messages
- modal dialog semantics and managed focus for found-word and review panels
- minimum 44px teacher controls
- layouts from phone width through classroom displays
- reduced-motion CSS that minimizes animation and hides confetti

Pointer Events are the only continuous tracing path. Tap and keyboard activation
use the same selection and scoring rules rather than separate game engines.

## Audio

Audio is optional enhancement:

- sound modes: Full, Tones, and Muted
- music modes: Low, Medium, and Off
- synthesized success, error, completion, and bonus cues
- browser speech synthesis for selected terms and praise
- v7 detective music in A natural minor at 84 BPM
- shared gain routing, speech ducking, screen-aware music start/stop, and audio
  node cleanup

AudioContext and speech failures are caught. Gameplay remains usable when audio
is blocked, suspended, missing, or muted.

## Current trust boundary

All application and curriculum code is public because GitHub Pages serves static
files. There is no secure premium-content or user-authorization boundary in the
current release. Any future account or paid-access system must be implemented
server-side rather than as a client-only flag.
