# Math Vocabulary Hunt Design System

Status: Phase 1C.5A foundation for the isolated Next.js platform shell. It does
not restyle the canonical v7 game or add product capabilities.

## Direction: scholarly field guide

The system combines the structure of a teacher's field guide with the energy
of a classroom vocabulary hunt. Deep ink and navy establish authority;
saffron acts like a physical highlighter; pale blue paper supports long viewing
on shared displays; coral appears only as a restrained dimensional accent. The
graph-paper vocabulary trail is the signature visual and should not be repeated
as decoration throughout every screen.

The product should feel energetic but not childish, professional but not
corporate, and memorable without visual noise. External fonts, stock art,
glassmorphism, decorative gradients, and continuous animation are excluded.

## Architecture

- `apps/platform-web/styles/tokens.css`: semantic design decisions.
- `apps/platform-web/styles/foundations.css`: document defaults and focus rules.
- `apps/platform-web/styles/components.css`: reusable component styling.
- `apps/platform-web/styles/platform-pages.css`: route-specific composition.
- `apps/platform-web/components/ui`: controls and visual primitives.
- `apps/platform-web/components/layout`: page structure and navigation.
- `apps/platform-web/components/feedback`: notices and honest empty states.

Page code should compose these layers instead of introducing raw colors,
one-off controls, or new spacing scales.

## Brand foundation

The wordmark remains text so it is readable, selectable, and resilient without
an image asset. The CSS-colored inline SVG mark combines a coordinate grid and
an upward vocabulary trail. It is an initial product mark, not a trademark
claim or final logo system.

Future favicon and app-icon work should derive a square, simplified version of
the grid-and-trail mark, verify it at 16, 32, 180, and 512 pixels, and include a
monochrome maskable treatment. No favicon files are created in this phase.

## Remaining brand decisions

- Final wordmark letterform and whether a licensed font is justified.
- Final app-icon geometry after small-size legibility testing.
- Print-safe and one-color marks for classroom materials.
- Formal brand ownership and trademark review.
- Whether coral remains a brand accent beyond the platform preview.
