"use client";

// Route-level error boundary: without it a thrown server error surfaced the
// unbranded framework error screen — indistinguishable from "the site did not
// open". Keeps navigation and a retry path on screen.
export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <div className="page-stack container">
      <header className="page-header">
        <p className="eyebrow">Something went wrong</p>
        <h1>MathNexa hit a temporary problem.</h1>
        <p>Nothing about your account or subscription changed. Trying again usually resolves it.</p>
      </header>
      <div className="button-row">
        <button type="button" className="button" onClick={() => reset()}>
          Try again
        </button>
        <a className="button button-secondary" href="/">
          Back to MathNexa home
        </a>
      </div>
    </div>
  );
}
