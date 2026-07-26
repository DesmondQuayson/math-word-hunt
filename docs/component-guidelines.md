# Component Guidelines

Phase 1C.5A deliberately provides a small inventory.

| Component | Use |
| --- | --- |
| `Button` | Native in-page action; supports primary, secondary, ghost, danger, loading, disabled, and an optional icon |
| `LinkButton` | Navigation that needs button emphasis; remains a semantic link |
| `Card` | Standard, interactive-emphasis, muted, or highlighted content boundary; it is never clickable by itself |
| `StatusBadge` | Compact textual status with a redundant dot cue |
| `Notice` | Labeled information, success, warning, or danger message; use `live` only for newly injected urgent errors |
| `PageHeader` | The single route-level heading and description |
| `SectionHeader` | A labeled section heading with an explicit ID |
| `EmptyState` | Truthful absence plus a real next action |
| `PlaceholderState` | Clearly labeled future capability without fabricated data |
| `Divider` | Semantic thematic break using `hr` |
| `VisuallyHidden` | Accessible text that should not affect visual layout |
| `SkipLink` | First keyboard path into main content |
| `Container` | Compact, standard, or wide readable width |
| `Stack` | Vertical rhythm in compact, standard, or spacious density |
| `Cluster` | Wrapping inline actions or labels |
| `AppShell` | Shared banner, main, skip link, and footer landmarks |
| `TeacherShell` | Existing teacher-preview routes and their local navigation |
| `NavigationItem` | Semantic navigation link with optional current-page state |

## Rules

- Prefer native elements and preserve their keyboard behavior.
- Use `Button` for actions and `LinkButton` for destinations.
- Put the meaningful link inside an interactive-style card; never add click
  handlers to the card container.
- Give every `Notice` a useful accessible label.
- Static notices should not use `role=alert`; reserve live announcements for
  messages that appear after an action.
- Loading buttons stay disabled, retain their visible label, expose
  `aria-busy`, and add hidden loading text.
- Empty states describe what is absent and offer a real action when one exists.

## Prohibited patterns

- `div` or `span` elements acting as buttons.
- Nested buttons and links.
- Disabled links pretending to be unavailable buttons.
- Clickable cards without an identifiable link or button.
- Unbounded polymorphic `as` props.
- Raw authorization, persistence, or billing logic inside components.
- Color-only states, hidden focus rings, duplicate IDs, or unlabeled icons.
- Sample teachers, classes, students, reports, or subscription records.
- One-off raw colors and spacing values when a semantic token exists.
