import Link from "next/link";

import { Container } from "@/components/layout/container";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Container className="footer-inner">
        <p>
          Platform preview. The current classroom game remains the active
          experience.
        </p>
        <div className="footer-links">
          <Link href="/pilot/privacy">Pilot privacy</Link>
          <Link href="/play">Go to the game gateway</Link>
        </div>
      </Container>
    </footer>
  );
}
