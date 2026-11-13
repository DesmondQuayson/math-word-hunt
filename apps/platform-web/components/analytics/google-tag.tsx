import { GOOGLE_TAG_INITIALIZATION, GOOGLE_TAG_SCRIPT_URL } from "@/lib/analytics/google-tag";

/**
 * Google's installation code, server-rendered into the document head so the
 * tag is present in the HTML itself (what Google's installation test looks
 * for). React dedupes `<script async src>` by URL, and the root layout's head
 * is not re-rendered on client-side navigation, so the container loads once
 * per document.
 */
export function GoogleTag() {
  return (
    <>
      <script async src={GOOGLE_TAG_SCRIPT_URL} />
      {/* A constant text child: React writes it verbatim (escaping only
          "</script"), so no raw-HTML API is needed. */}
      <script id="google-tag-init">{GOOGLE_TAG_INITIALIZATION}</script>
    </>
  );
}
