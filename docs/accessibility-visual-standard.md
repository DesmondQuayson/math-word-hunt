# Accessibility and Visual Standard

The platform shell targets WCAG 2.2 AA for contrast, semantics, focus, and
input behavior. Automated checks supplement rather than replace human review.

## Required behavior

- One `h1` per route followed by logical section headings.
- Banner, named navigation, main, and contentinfo landmarks.
- A first-tab skip link that moves focus to main content.
- A visible 3-pixel focus outline on every keyboard-operable element.
- Native controls and links with accessible names.
- Minimum 44 by 44 pixel interactive targets on phone, tablet, and shared display.
- Normal text and control states meeting WCAG AA contrast.
- Status conveyed with words and structure, never color alone.
- Error alerts announced only when they appear dynamically.
- Disabled and loading buttons remain programmatically disabled.
- No duplicate IDs or invalid button/link nesting.

## Motion

Motion is limited to short hover/focus feedback. There is no parallax,
autoplay, continuous animation, or decorative page entrance. Under
`prefers-reduced-motion: reduce`, scrolling becomes immediate and transitions
and animations collapse to effectively zero duration.

## Classroom viewing

Text blocks remain width-limited on Smart Boards. Important labels and controls
must remain legible at a distance, captions do not shrink below 13 pixels, and
the interface cannot depend on hover. Saffron focus remains visible against
both the navy shell and pale content surfaces.

## Verification

Vitest covers component semantics, keyboard activation, disabled/loading
behavior, alert behavior, nesting, and IDs. Playwright covers focus visibility,
skip behavior, target size, landmarks, heading hierarchy, reduced motion, and
horizontal overflow across required viewports.
