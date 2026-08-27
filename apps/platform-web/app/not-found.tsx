import Link from "next/link";

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
