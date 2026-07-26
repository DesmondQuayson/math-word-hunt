# Platform Shell Design

Status: Phase 1C.5A design-system preview. The shell is not the production game
and does not imply that future services exist.

## Product job and visual direction

The shell helps a teacher understand the product, reach the current game, and
inspect the planned workspace without encountering invented data or premature
commercial claims. Its visual language is a scholarly field guide: deep navy
for authority, pale blue paper, saffron wayfinding, coral as a restrained
physical shadow, dependable system type, and one graph-paper vocabulary trail.
No external font or image service is required. Token and component sources are
documented in `design-system.md`, `design-tokens.md`, and
`component-guidelines.md`.

## Routes

| Route | Behavior |
| --- | --- |
| `/` | Product introduction, current-game launch path, and clearly labeled teacher preview |
| `/play` | Controlled gateway to the preserved canonical v7 game |
| `/teacher` | Anonymous teacher workspace overview with default-deny access state |
| `/teacher/classes` | Empty future class-management area; no roster or persistence claims |
| `/teacher/reports` | Empty future reporting area; no fabricated student or achievement data |
| `/account` | Signed-out teacher-account placeholder with no auth, plan, or portal claims |

All pages are App Router Server Components. The current shell requires no
client component, browser storage, or hydration-based access decision.

## Accessibility decisions

- One level-one heading per route with logical lower headings.
- Shared banner, named navigation, main, and contentinfo landmarks.
- A keyboard-visible skip link and a focusable main target.
- Three-pixel saffron focus rings that remain visible against light and dark UI.
- Native links, details, and summary elements rather than custom controls.
- All visible interactive targets are at least 44 pixels high.
- Text and controls use high-contrast navy, white, yellow, and restrained muted
  colors; color is never the only access-state signal.
- Responsive layouts are verified from 390 by 844 through 1920 by 1080, with
  explicit tablet, classroom-laptop, desktop, and Smart Board checks.
- Motion is limited to short hover transitions and is effectively removed by
  `prefers-reduced-motion`.

## Honest empty states

Empty states state what is absent and why. They do not show example rosters,
scores, charts, saved classes, accounts, pricing, or achievements. Each state
offers a real next action, such as returning to the teacher overview or playing
the current game without an account.
