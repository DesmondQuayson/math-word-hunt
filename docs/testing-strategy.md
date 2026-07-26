# Testing Strategy

## Test layers

### Canonical and content integrity

npm run test:content verifies:

- the Phase 1A hashes for docs/index.html and docs/vocab.js
- the sibling vocab.js script reference
- equality of the deployment and historical root vocabulary copies
- 506 term definitions
- Grades 6–8
- 53, 57, and 60 playable lessons
- zero unresolved curriculum term references
- eight documented missing lessons
- thirteen documented thin lessons
- no blocking curriculum-audit problem

### Canonical browser regression

npm run test:e2e:canonical verifies:

- v7 launch and successful vocab.js response
- runtime curriculum self-check
- grade, team, topic, and lesson setup
- a complete lesson through the review screen
- keyboard activation and arrow-key grid navigation
- continuous Pointer Event selection
- 390 by 844 mobile containment and 44px teacher controls
- reduced-motion behavior
- safe behavior when Web Audio and speech synthesis are unavailable
- disabled missing content and Combine Mode for thin lessons
- absence of unexpected external requests and browser errors on launch

### Historical regression

The existing v5 Playwright file is retained to protect a historical rollback
reference. It is not a substitute for the canonical suite.

### Platform contracts and shell

`npm run test:unit` runs fourteen platform-core tests, including public exports,
and four platform-web adapter tests. `npm run test:e2e:platform` verifies all six
routes, headings and landmarks, keyboard navigation, visible focus, responsive
containment, 44px targets, reduced motion, anonymous teacher state,
default-deny access, browser-authority negatives, the canonical game link,
unavailable-game recovery, and absence of fabricated persistence.

`npm run build` compiles and prerenders every platform route. After the build,
`npm run test:security` scans client assets for secret markers and checks that
platform-core production source has no framework, provider, browser, or Node
business-logic dependency.

## Commands

- npm run lint
- npm run typecheck
- npm run test:content
- npm run test:unit
- npm run test:e2e:canonical
- npm run test:e2e
- npm run test:e2e:platform
- npm run build
- npm run test:security
- npm test

## Manual release checks

Before a release, inspect at minimum:

- 390 by 844 phone
- 768 by 1024 tablet
- 1366 by 768 laptop/classroom display
- 1920 by 1080 classroom display
- keyboard-only lesson completion
- touch or stylus Pointer Event selection
- Full, Tones, and Muted modes
- Low, Medium, and Off music modes
- reduced-motion operating-system preference
- browser-blocked audio
- returning from the game to lessons and audio cleanup

Automated tests do not replace curriculum review, screen-reader testing,
physical Smart Board testing, or a real classroom session.
