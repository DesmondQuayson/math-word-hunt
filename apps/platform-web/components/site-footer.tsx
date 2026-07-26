import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <p>
          Platform preview. The current classroom game remains the active
          experience.
        </p>
        <Link href="/play">Go to the game gateway</Link>
      </div>
    </footer>
  );
}
