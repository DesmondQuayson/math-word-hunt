# Responsive Design Standard

The shell uses content-driven grids and bounded containers rather than a
desktop layout scaled down or a Smart Board layout stretched wide.

| Viewport | Expected behavior |
| --- | --- |
| 390×844 phone | Single-column hero, stacked vocabulary terms and cards, full-width actions where needed, no horizontal overflow |
| Tablet portrait | Teacher navigation remains clear, content grids collapse when reading width requires it |
| Tablet landscape | Two-column workspace cards may appear while copy remains bounded |
| 1366×768 laptop | Primary content and launch actions remain visible without tiny type |
| 1440×900 desktop | Standard 74rem container balances copy and supporting visuals |
| 1920×1080 Smart Board | Content remains centered and capped; line lengths and controls do not stretch excessively |

## Rules

- Start with a 320-pixel minimum document width.
- Use the 40rem mobile, 54rem tablet, and 90rem wide-display references.
- Keep page gutters between 16 and 32 pixels.
- Prefer wrapping and grid collapse to horizontal scrolling.
- Do not reduce interactive targets to fit a row.
- Cap readable copy at 68 characters and platform content at 74rem by default.
- Use the 90rem container only for intentionally visual compositions.
- Verify portrait and landscape tablet modes before introducing a new grid.
- Test Smart Board layouts for distance readability, not merely absence of overflow.
