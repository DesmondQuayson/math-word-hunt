# Platform Shell Design

Status: Phase 1C implemented preview. The shell is not the production game and
does not imply that future services exist.

## Product job and visual direction

The shell helps a teacher understand the product, reach the current game, and
inspect the planned workspace without encountering invented data or premature
commercial claims. Its visual language is a classroom math notebook: deep navy
for focus, pale blue paper, saffron wayfinding, coral as a restrained physical
shadow, rounded display type, and a graph-paper vocabulary board. No external
font or image service is required.

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
- Four-pixel saffron focus rings that remain visible against light and dark UI.
- Native links, details, and summary elements rather than custom controls.
- All visible interactive targets are at least 44 pixels high.
- Text and controls use high-contrast navy, white, yellow, and restrained muted
  colors; color is never the only access-state signal.
- Responsive layouts are verified at 390 by 844 and designed for tablet,
  desktop, and shared classroom displays.
- Motion is limited to short hover transitions and is effectively removed by
  `prefers-reduced-motion`.

## Honest empty states

Empty states state what is absent and why. They do not show example rosters,
scores, charts, saved classes, accounts, pricing, or achievements. Each state
offers a real next action, such as returning to the teacher overview or playing
the current game without an account.
