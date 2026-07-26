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
        <Link href="/play">Go to the game gateway</Link>
      </Container>
    </footer>
  );
}
