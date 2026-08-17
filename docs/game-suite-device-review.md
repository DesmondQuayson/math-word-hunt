# Game suite manual device review

Automation provides Chromium and Playwright WebKit coverage. It does not certify real Apple hardware or a classroom display.

## Mac with Safari

- Sign in as an entitled adult and open `/games`.
- Confirm all four 16:9 thumbnails are sharp, uncropped at their titles, and keyboard-focusable through their Play actions.
- Launch each game; on the first normal click or key press confirm music starts when Safari permits it.
- Turn music off and on, reload, navigate to the next game, and confirm only the current game is audible.
- Complete one puzzle/round with keyboard input where supported.
- Enter and exit fullscreen when offered; confirm focus and layout recover.

## iPad with Safari

- Test 768×1024 portrait and 1024×768 landscape, plus Split View if available.
- Confirm tap targets are comfortable, no board interaction selects page text, and no essential action depends on hover.
- Rotate during play; confirm the board, tray/grid, sticky controls, and dialogs remain reachable.
- Confirm music unlocks on the first legitimate touch and remains optional.
- Complete one puzzle/round and reload to verify intended local progress.

## Classroom Smart Board

- Test 1920×1080 with touch, mouse, and keyboard.
- Confirm the catalog titles and game boards are readable from the back of the room.
- Launch each game in no more than one catalog action plus any browser-required sign-in.
- Confirm primary controls have generous targets, selected/correct/incorrect states are unambiguous, and dialogs are centered.
- Test presentation/fullscreen when supported and the responsive fallback when it is not.
- Complete one puzzle/round with audio on, then with audio blocked.

Record browser/device versions, orientation, input type, pass/fail, and a short issue description. Never record a student identity.
