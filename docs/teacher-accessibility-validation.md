# Teacher Accessibility Validation

Status: Phase 1C.5C engineering validation; no WCAG certification is claimed.

## Findings and corrections

| Area | Evidence | Result or correction |
| --- | --- | --- |
| Keyboard and skip link | Playwright Tab/Enter traversal | Skip link reaches focused main content; teacher navigation and forms follow DOM order |
| Landmarks | Route-wide structural checks | One banner, main, and footer per route; teacher and breadcrumb navigation have distinct names |
| Workflow steps | Code and accessibility-tree review | Changed from a `nav` landmark to a labeled ordered list because the steps are not links |
| Headings | Route-wide browser checks | One `h1` per route and ordered section headings |
| Focus visibility | Computed-style checks | Global 3px focus outline retained; forced-colors uses system `Highlight` |
| Validation recovery | Component and Playwright tests | Error summary receives focus; summary links move focus to the invalid control |
| Field errors | DOM inspection | Visible labels, textual required indicators, `aria-invalid`, and `aria-describedby` |
| Active route | Keyboard and attribute checks | `aria-current="page"` plus visible “Current” text; forced-colors adds a full border |
| Unavailable actions | Session scenario | Native disabled button with an accessible explanatory description |
| Tables and lists | Responsive checks | Semantic table retained; narrow layouts expose cell labels without changing source order |
| Breadcrumbs | Component inspection | Named navigation; current item uses `aria-current` and is not a link |
| Notices | Component correction | Static guidance uses `role="note"`; live failures use `role="alert"` |
| Status labels | Content inspection | Every status has text; color dots are supplementary and hidden from accessibility APIs |
| Reduced motion | Existing browser regression | Smooth scrolling and transitions are removed under reduced motion |
| Forced colors | New media rules and browser check | Focus, current navigation, disabled controls, notices, cards, and states keep visible boundaries |
| 200%/400% reflow | 640px/320px automated proxies | No horizontal page overflow; controls and labels remain available |
| Text spacing | Injected spacing override | Core activity workflow remains readable and operable without page overflow |
| Mobile landscape | 667×375 scenario | Navigation, form labels, and submit action remain available |
| Touch targets | Computed-size regression | Interactive targets remain at least 44px |

## Viewport evidence

Automated coverage includes 320×568, 390×844, 667×375, 768×1024,
1024×768, 1366×768, 1440×900, 1920×1080, and 2560×1440. The 320px
layout also represents 400% reflow of a 1280px viewport; 640px represents 200%
reflow. This validates responsive behavior but does not replace manual browser
zoom testing with assistive technology.

## Remaining manual validation

- Moderated keyboard and screen-reader review with teachers.
- Windows High Contrast testing on physical Windows configurations in addition
  to Chromium forced-colors emulation.
- Browser-native 200% and 400% zoom across Chrome, Edge, Firefox, and Safari.
- Voice control, magnifier, and switch-device workflows.
- Text-spacing review with user styles in multiple browsers.

No accessibility certification or conformance level is asserted by this phase.
