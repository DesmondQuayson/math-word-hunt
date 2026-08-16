# CrossCalc V2 release record

CrossCalc V2 is an owner-authorized in-place release of catalog identity
`f457a0db-98bb-4401-8584-c8ba5cd93c98` from `0.1.0` to `0.2.0`. The public
route remains `/games/crosscalc/play`, and V1 history and storage remain
unchanged. V2 uses `crosscalc-result/2` and `mathnexa.crosscalc.v2`.

## Open post-release issues

- Audio: CrossCalc and Number Logic background audio may remain IDLE or PAUSED
  with zero active sources in authenticated Production browsers. Status: OPEN —
  OWNER ACCEPTED FOR V2 RELEASE. Priority: high post-release hotfix.
- Narrow viewport: Undo/Redo and Pause/Resume may be inaccessible around 304px.
  Status: OPEN — responsive hardening. The supported 390×844, 844×390, and
  768×1024 layouts remain the release gate.

V1 remains the rollback target. Rollback restores the V1 renderer through the
catalog version gate and restores the V1 version, thumbnail, and metadata from
the append-only version snapshot without deleting V1 or V2 results.
