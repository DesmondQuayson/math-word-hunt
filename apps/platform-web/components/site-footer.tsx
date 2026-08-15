import Link from "next/link";

import { Container } from "@/components/layout/container";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { loadPublishedCmsDocument } from "@/lib/cms/public";

export async function SiteFooter() {
  const publicProduction = isProductionPublicMode();
  const productionPlatform = isProductionPlatformMode();
  const managed=productionPlatform?await loadPublishedCmsDocument("footer"):null;const allowed=new Map([["/privacy","Privacy"],["/accessibility","Accessibility"],["/terms","Terms"],["/cancellation","Cancellation"],["/refunds","Refunds"],["/support","Support"],["/play","Game access"]]);for(const block of managed?.content.blocks??[])for(const item of block.items??[])if(item.href&&allowed.has(item.href))allowed.set(item.href,item.title);
  return (
    <footer className="site-footer">
      <Container className="footer-inner">
        <p>{productionPlatform ? "MathNexa stores only the minimum account and subscription data required to provide protected game access." : publicProduction ? "MathNexa provides public math-vocabulary resources without accounts or student data." : "Platform preview. The current classroom game remains the active experience."}</p>
        <div className="footer-links">
          <Link href={publicProduction || productionPlatform ? "/privacy" : "/pilot/privacy"}>{productionPlatform?allowed.get("/privacy"):publicProduction ? "Privacy" : "Pilot privacy"}</Link>
          {publicProduction || productionPlatform ? <Link href="/accessibility">{productionPlatform?allowed.get("/accessibility"):"Accessibility"}</Link> : null}
          {productionPlatform ? <Link href="/terms">{allowed.get("/terms")}</Link> : null}
          {productionPlatform ? <Link href="/cancellation">{allowed.get("/cancellation")}</Link> : null}
          {productionPlatform ? <Link href="/refunds">{allowed.get("/refunds")}</Link> : null}
          {productionPlatform ? <Link href="/support">{allowed.get("/support")}</Link> : null}
          <Link href="/play">{productionPlatform ? allowed.get("/play") : "Go to the game gateway"}</Link>
        </div>
      </Container>
    </footer>
  );
}
