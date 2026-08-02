import Link from "next/link";

import { Container } from "@/components/layout/container";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export function SiteFooter() {
  const publicProduction = isProductionPublicMode();
  const productionPlatform = isProductionPlatformMode();
  return (
    <footer className="site-footer">
      <Container className="footer-inner">
        <p>{productionPlatform ? "MathNexa stores only the minimum account and subscription data required to provide protected game access." : publicProduction ? "MathNexa provides public math-vocabulary resources without accounts or student data." : "Platform preview. The current classroom game remains the active experience."}</p>
        <div className="footer-links">
          <Link href={publicProduction || productionPlatform ? "/privacy" : "/pilot/privacy"}>{publicProduction || productionPlatform ? "Privacy" : "Pilot privacy"}</Link>
          {publicProduction || productionPlatform ? <Link href="/accessibility">Accessibility</Link> : null}
          {productionPlatform ? <Link href="/terms">Terms</Link> : null}
          {productionPlatform ? <Link href="/cancellation">Cancellation</Link> : null}
          {productionPlatform ? <Link href="/refunds">Refunds</Link> : null}
          {productionPlatform ? <Link href="/support">Support</Link> : null}
          <Link href="/play">{productionPlatform ? "Game access" : "Go to the game gateway"}</Link>
        </div>
      </Container>
    </footer>
  );
}
