# Teacher Scenario Validation

Status: Phase 1C.5C automated and document-based validation. This is not a
substitute for moderated research with teachers.

## 1. Launch the current game before class

- Teacher goal: start vocabulary play immediately.
- Entry route: `/teacher`.
- Expected steps: choose **Open current v7 game**, review the launch page, then
  open the canonical game.
- Successful outcome: the `/play` gateway exposes the real v7 launch and its
  fallback instructions.
- Unavailable capability: saved setup, account context, or managed live session.
- Required system message: accounts and saving are not available yet.
- Privacy implication: no teacher or student identity is required.
- Failure/recovery path: if the game window is blocked or unavailable, the
  launch page remains open with a direct fallback link and no work to lose.
- Acceptance criteria: primary action is keyboard reachable, at least 44px,
  visible at 320px and 2560px, and resolves to `docs/index.html`.

## 2. Understand future classes while signed out

- Teacher goal: understand what a class will organize.
- Entry route: `/teacher/classes`.
- Expected steps: read the no-saved-classes state, privacy boundary, and class
  setup link.
- Successful outcome: teacher understands that a class groups activities and
  aggregate live-session history without requiring a roster.
- Unavailable capability: creating, saving, archiving, or deleting a class.
- Required system message: accounts and saved classes are not available yet.
- Privacy implication: the first class model contains no student names,
  emails, IDs, or membership list.
- Failure/recovery path: return to Overview or inspect the unsaved class form.
- Acceptance criteria: no production fixture appears and the form is presented
  as a review, not a working create flow.

## 3. Plan a vocabulary activity

- Teacher goal: check grade, topic, lesson, game mode, time, teams, and Combine
  Mode before class.
- Entry route: `/teacher/activities/new`.
- Expected steps: select all content and play settings, optionally enable
  Combine Mode, then check the setup.
- Successful outcome: valid choices produce “Nothing was assigned or saved.”
- Unavailable capability: saving or assignment delivery.
- Required system message: saving and assignment delivery are unavailable.
- Privacy implication: activity configuration contains no participant data.
- Failure/recovery path: focused error summary links to every invalid field;
  cancel returns to Activities.
- Acceptance criteria: all labels are associated, required fields are textual,
  time is 1–60 minutes, teams are 2–8, and thin lessons retain guidance.

## 4. Review class setup without persistence

- Teacher goal: understand the minimum class information.
- Entry route: `/teacher/classes/new`.
- Expected steps: enter class name, optional grade, optional period/section,
  then check the setup.
- Successful outcome: valid input produces “Nothing was saved.”
- Unavailable capability: creating or saving the class.
- Required system message: do not enter student names; saving is unavailable.
- Privacy implication: no roster or student account field exists.
- Failure/recovery path: error summary receives focus; its class-name link moves
  focus to the invalid input; cancel returns to Classes.
- Acceptance criteria: class name is 2–80 characters, messages are linked with
  `aria-describedby`, and no fake success appears.

## 5. Distinguish v7 from a managed live session

- Teacher goal: know which classroom experience works today.
- Entry route: `/teacher/sessions`.
- Expected steps: compare Current v7 game with Managed live session, then review
  the setup states.
- Successful outcome: teacher can open v7 and recognizes managed-session setup
  as unavailable.
- Unavailable capability: remote join, live connection, recovery, and saved
  completion records.
- Required system message: remote student devices cannot join.
- Privacy implication: no participant identity is collected.
- Failure/recovery path: the disabled managed-session action explains its
  dependency; v7 remains available.
- Acceptance criteria: available and unavailable paths are named in text, not
  color alone, and the disabled action has an accessible description.

## 6. Understand aggregate reports

- Teacher goal: see how future results could support lesson review.
- Entry route: `/teacher/reports`.
- Expected steps: read the honest no-data state, reporting levels, and limits.
- Successful outcome: teacher understands class-, activity-, lesson-,
  vocabulary-, and session-level aggregate uses.
- Unavailable capability: persisted reports or calculations from real sessions.
- Required system message: no mastery, predictive, ranking, or student-level
  claims are made.
- Privacy implication: contracts contain aggregate team/session values only.
- Failure/recovery path: review Live Sessions to understand where future
  aggregate inputs would originate.
- Acceptance criteria: production is empty; fixture reports are prominently
  labeled; the table preserves headers and readable mobile labels.

## 7. Check curriculum readiness

- Teacher goal: identify ready, thin, missing, and review-pending content.
- Entry route: `/teacher/curriculum`.
- Expected steps: review counts, four status labels, teacher-review warning, and
  Combine Mode explanation.
- Successful outcome: teacher can avoid unavailable lessons and plan around thin
  lessons without mistaking technical checks for teacher approval.
- Unavailable capability: editing vocabulary or claiming completed expert review.
- Required system message: teacher review is still required.
- Privacy implication: curriculum contains no account or classroom data.
- Failure/recovery path: return to Activities and choose another lesson or use
  documented Combine Mode behavior.
- Acceptance criteria: 506 terms, 170 playable, 8 missing, 13 thin, and zero
  unresolved references remain consistent with the content audit.

## 8. Use a Smart Board from several feet away

- Teacher goal: navigate and launch v7 on a large shared display.
- Entry route: `/teacher` at 1920×1080 or 2560×1440.
- Expected steps: scan the field map and choose the prominent v7 action.
- Successful outcome: content remains centered, readable, and bounded.
- Unavailable capability: no special kiosk or remote-control mode.
- Required system message: current v7 is available; account features are not.
- Privacy implication: no classroom information is projected by default.
- Failure/recovery path: browser zoom may be increased without losing actions.
- Acceptance criteria: content width is no more than 1440px, heading is at least
  40px, action text at least 16px, targets at least 44px, and no overflow.

## 9. Use only a keyboard

- Teacher goal: reach all routes, forms, and the v7 launch without a pointer.
- Entry route: any platform route.
- Expected steps: use skip link, Tab/Shift+Tab, Enter/Space, and native selects.
- Successful outcome: focus order follows the page, current navigation is
  announced, forms validate, and actions activate.
- Unavailable capability: none specific to keyboard input.
- Required system message: validation summary and unavailable-action reason.
- Privacy implication: keyboard input is not logged or analyzed.
- Failure/recovery path: validation summary moves focus to the error region and
  links back to affected fields.
- Acceptance criteria: visible 3px focus, logical navigation order, semantic
  controls, no keyboard trap, and no hover-only information.

## 10. Use 200% and 400% zoom

- Teacher goal: enlarge content without losing information or functionality.
- Entry route: Overview, activity planning, and live-session setup.
- Expected steps: zoom to 200% or 400%, navigate, read, and operate forms.
- Successful outcome: content reflows into one column where needed and all
  controls remain reachable.
- Unavailable capability: none specific to zoom.
- Required system message: unchanged; content must not be replaced at zoom.
- Privacy implication: zoom preference is not stored or tracked.
- Failure/recovery path: browser scrolling remains vertical; no horizontal page
  pan is required.
- Acceptance criteria: 640px and 320px reflow proxies have no page overflow,
  labels remain associated, navigation remains discoverable, and actions remain
  present. Automation validates reflow; manual browser zoom remains recommended.
