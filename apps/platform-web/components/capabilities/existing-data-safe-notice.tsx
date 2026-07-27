import { Notice } from "@/components/feedback/notice";

export function ExistingDataSafeNotice() {
  return <Notice label="Downgrade protection" tone="success">
    <strong>Your existing work stays safe.</strong>
    <p>Changing to Free never deletes, hides, truncates, or automatically archives saved classes or activity drafts. Safe edits and archiving remain available; new creation follows the Free limits.</p>
  </Notice>;
}
