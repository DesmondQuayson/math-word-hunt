# MathNexa v1.2.17 — Math Tug of War Two Teams Smart Board copy hotfix

Released 2026-09-27 under explicit owner approval.

| | |
| --- | --- |
| Version / tag | `v1.2.17` (annotated, tag object `42ebb955`) |
| Runtime commit | `b6337c8` (branch `fix/tug-two-teams-smart-board-copy`, staging-approved) |
| Main | `b6337c8` at release, fast-forward from `f2c3382`; this record follows as a docs/tooling commit |
| Production deployment | `dpl_14A8uM4MBvkPZhvXQLSdHADxzdBD` (mathnexa-platform-production-69rwuo4y0) |
| Previous / rollback | `dpl_C2FLfRVupPRsRkQcjTnx5xNwjfRT` (v1.2.16, READY) |

## Change (copy/UI only)

- The Two Teams mode card badge changed from "Same Screen" to **"Best Played on Smart Board"**. The title
  "Two Teams" and the description "Play together on one device" are unchanged.
- The Two Teams setup-screen badge still reads "Same Screen" (owner decision).
- `.mode-card .mode-badge { max-width: 100%; text-wrap: balance; }`: the longer badge wraps as "Best Played
  on / Smart Board" on wide cards and stays on one line on phones.
- Runtime hash refreshed.
- The local suite asserts the exact card copy and that the badge stays inside its card.
- Gameplay, questions, robot, Online Match, access rules, homepage, music, sound and colours are unchanged.
- No database change and no migration.

## Checks

| Gate | Result |
| --- | --- |
| Tug unit tests (incl. runtime hash) | 127/127 |
| TypeScript, ESLint | clean |
| Local e2e (desktop Chromium/WebKit, Pixel 7, iPhone 13, iPad) | 106 + 1 WebKit page crash, rerun 23/23 |
| Badge fit, 304/320/390/844/768/1024/1366/1920 at 100 % and 200 %, Chromium + WebKit | 32/32 |
| Production build | pass |
| Staging review (dpl_86tTEhssJwyzJN6J9Fw7b3e8qwyf) | 94/94 |
| Pipeline preflight → candidate → probe-preview 6/6 → promote | pass |
| probe-live | 22/22 |
| Live review on mathnexa.com (Chromium + WebKit) | 99/99 |

The live review covers:

- the exact card copy;
- VS Robot and Online Match cards unchanged;
- no "Same Screen" on the mode cards, while the setup-screen badge still reads "Same Screen";
- badge fit at 304–1920 at 100 % and 200 %;
- free signed-in access;
- other products still protected;
- the homepage card;
- all six skills and the 7-pull win;
- VS Robot, Two Teams and Online Match, including non-subscriber pairings;
- phone, iPad and Smart Board.

The only page errors were WebKit's aborted RSC prefetches during navigation ("access control checks"),
the same pattern as v1.2.16. There were 0 application errors and no 5xx responses.
