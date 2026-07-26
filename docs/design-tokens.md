# Design Tokens

The source of truth is `apps/platform-web/styles/tokens.css`. Components use
semantic names so a future dark mode can remap meaning without changing their
markup. Phase 1C.5A implements light mode only.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas` | `#e8f2f5` | Main page field |
| `--color-surface` | `#f8fbfc` | Paper sections |
| `--color-surface-elevated` | `#ffffff` | Cards and notices |
| `--color-surface-muted` | `#dcebee` | Quiet interactive emphasis |
| `--color-text-primary` | `#0b2239` | Headings and primary copy |
| `--color-text-secondary` | `#294e63` | Long-form supporting copy |
| `--color-text-muted` | `#567181` | Secondary explanation |
| `--color-border` | `#bdd1da` | Standard boundaries |
| `--color-border-strong` | `#315b72` | Emphasized boundaries |
| `--color-brand-primary` | `#0d3b57` | Primary actions and panels |
| `--color-brand-primary-hover` | `#082c43` | Hover and shell chrome |
| `--color-brand-secondary` | `#f5c542` | Wayfinding and highlight |
| `--color-accent` | `#d95d45` | Restrained physical accent |
| `--color-success` | `#12664f` | Confirmed success |
| `--color-warning` | `#855a00` | Caution and utility labels |
| `--color-danger` | `#9f3434` | Destructive or failed state |
| `--color-information` | `#176684` | Neutral information |
| `--color-focus-ring` | `#ffca3a` | Keyboard focus |

Status always combines color with text, a mark, or a border. White text is used
only on colors with sufficient contrast; yellow carries dark text.

## Typography

- Display: Trebuchet MS with Avenir Next and Segoe UI fallbacks.
- Body: Avenir Next, Avenir, Segoe UI, then Arial.
- Utility: system monospace, Cascadia Mono, Segoe UI Mono, then Consolas.
- Heading levels use a fluid but bounded scale; body text starts at 16 pixels.
- Labels and captions never fall below 13 pixels.
- Body line length is capped at 68 characters.
- Scores, timers, and tabular data should apply `font-variant-numeric:
  tabular-nums` when those interfaces are introduced.

## Spacing, sizing, and density

The spacing scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, and 96 pixels.
Compact stacks use 12 pixels, standard stacks use 24, and spacious stacks use
40. Interactive targets have a 44-pixel minimum; standard controls are 48 and
spacious controls are 56.

Containers are capped at 48rem, 74rem, and 90rem. Page gutters scale between
16 and 32 pixels. Content should not expand solely because a display is wider.

## Borders, radius, shadow, and focus

- Border widths: 1, 2, and 3 pixels.
- Radius: 6, 12, and 20 pixels; pills are reserved for compact status/navigation.
- Shadows: a quiet elevation shadow plus one saffron and one coral offset shadow.
- Focus: 3-pixel saffron outline with a 3-pixel offset.

## Motion and layers

Functional motion durations are 80, 140, and 200 milliseconds with standard
and emphasized easing curves. Reduced motion collapses transitions and
animations to 0.001 milliseconds. Layer tokens reserve base, header, and skip
link positions; components must not invent arbitrary high z-index values.

## Breakpoint references

- Mobile: 40rem / 640px.
- Tablet: 54rem / 864px.
- Wide display: 90rem / 1440px.

CSS custom properties cannot drive media-query conditions, so media queries
use the documented fixed values that correspond to these reference tokens.
