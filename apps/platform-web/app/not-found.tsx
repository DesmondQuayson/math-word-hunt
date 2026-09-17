import Link from "next/link";
import type { Metadata } from "next";

/**
 * A missing page must not carry the root layout's "index, follow" robots hint
 * or a self-referencing canonical. The HTTP 404 status already keeps search
 * engines from indexing it, but the head should say the same thing rather than
 * contradict it (homepage + SEO audit, 2026-09).
 */
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default function NotFound() {
  return (
    <div className="page-stack container">
      <header className="page-header">
        <p className="eyebrow">Page not found</p>
        <h1>That page is not part of MathNexa.</h1>
        <p>The address may be out of date, or the resource may have moved.</p>
      </header>
      <div className="button-row">
        <Link className="button" href="/">
          Back to MathNexa home
        </Link>
        <Link className="button button-secondary" href="/support">
          Contact support
        </Link>
      </div>
    </div>
  );
}
