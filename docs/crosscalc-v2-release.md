# CrossCalc V2 release record

CrossCalc V2 is an owner-authorized in-place release of catalog identity
`f457a0db-98bb-4401-8584-c8ba5cd93c98` from `0.1.0` to `0.2.0`. The public
route remains `/games/crosscalc/play`, and V1 history and storage remain
unchanged. V2 uses `crosscalc-result/2` and `mathnexa.crosscalc.v2`.

## Post-release hotfix readiness

- Audio: the CrossCalc release candidate adds a same-origin media adapter around
  the byte-identical V2 bundle. It assigns the one MP3 source only inside the
  first eligible user gesture, preserves Music OFF/ON across reloads, leaves
  native sound effects intact, and disposes playback on route exit. Chromium
  verification requires real `currentTime` advancement and exactly one active
  source. The official Chromium and WebKit gates both require the frozen
  same-origin source, `PLAYING`, exactly one active source, decode readiness,
  and real `currentTime` advancement. Chromium also observes the native media
  request's 200/206 status; Playwright WebKit does not surface native media
  transactions through its `page.on('response')` hook. A media error or a
  claimed playback state without time advancement fails the release gate.
  If browser storage is unavailable, the adapter refuses to assign its external
  source unless native suppression can be written and read back; the released
  native controller and controls remain the sole music path, preventing overlap.
  Physical Production-browser smoke testing remains part of owner-supervised
  release QA.
- Portrait: the platform-owned integration stylesheet now supports 320×568,
  360×740, and 390×844 with a readable light calculation surface, a fully
  visible wrapping toolbar, reachable tray/actions, and 44px minimum controls.
  The document does not scroll horizontally; wide expert boards and number
  trays use their own clearly bounded scrolling regions. Tablet, landscape,
  and 1920×1080 desktop layouts remain in the regression matrix.

V1 remains the rollback target. Rollback restores the V1 renderer through the
catalog version gate and restores the V1 version, thumbnail, and metadata from
the append-only version snapshot without deleting V1 or V2 results.
