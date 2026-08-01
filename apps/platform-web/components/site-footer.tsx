import Link from "next/link";

import { Container } from "@/components/layout/container";
import { isProductionPublicMode } from "@/lib/environment/production-public";

export function SiteFooter() {
  const publicProduction = isProductionPublicMode();
  return (
    <footer className="site-footer">
      <Container className="footer-inner">
        <p>{publicProduction ? "MathNexa provides public math-vocabulary resources without accounts or student data." : "Platform preview. The current classroom game remains the active experience."}</p>
        <div className="footer-links">
          <Link href={publicProduction ? "/privacy" : "/pilot/privacy"}>{publicProduction ? "Privacy" : "Pilot privacy"}</Link>
          {publicProduction ? <Link href="/terms">Terms</Link> : null}
          {publicProduction ? <Link href="/pricing">Pricing</Link> : null}
          {publicProduction ? <Link href="/accessibility">Accessibility</Link> : null}
          <Link href="/play">Go to the game gateway</Link>
        </div>
      </Container>
    </footer>
  );
}
