import Link from "next/link";

import { Container } from "@/components/layout/container";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { loadPublishedCmsDocument } from "@/lib/cms/public";

function PlatformFooter({ legalLabels }: Readonly<{ legalLabels: ReadonlyMap<string, string> }>) {
  return (
    <footer className="site-footer site-footer-premium">
      <Container className="footer-inner">
        <div className="footer-brand">
          <p className="brand-name">Math<strong>Nexa</strong></p>
          <p>Teacher-led math resources in one platform. MathNexa stores only the minimum account and subscription data required to provide protected game access.</p>
        </div>
        <nav className="footer-column" aria-labelledby="footer-products">
          <h2 id="footer-products">Products</h2>
          <Link href="/games">Games</Link>
          <Link href="/map-prep">MAP Prep</Link>
          <Link href="/homework">Homework</Link>
          <Link href="/quizzes">Quizzes</Link>
        </nav>
        <nav className="footer-column" aria-labelledby="footer-account">
          <h2 id="footer-account">Account</h2>
          <Link href="/account">My Account</Link>
          <Link href="/subscription">Subscription</Link>
          <Link href="/play">{legalLabels.get("/play")}</Link>
          <Link href="/support">{legalLabels.get("/support")}</Link>
        </nav>
        <nav className="footer-column" aria-labelledby="footer-legal">
          <h2 id="footer-legal">Legal</h2>
          <Link href="/privacy">{legalLabels.get("/privacy")}</Link>
          <Link href="/terms">{legalLabels.get("/terms")}</Link>
          <Link href="/accessibility">{legalLabels.get("/accessibility")}</Link>
          <Link href="/cancellation">{legalLabels.get("/cancellation")}</Link>
          <Link href="/refunds">{legalLabels.get("/refunds")}</Link>
        </nav>
      </Container>
      <Container className="footer-meta">
        <p className="footer-attribution">
          Author: Desmond Quayson · Contact: <a href="mailto:quaysondesmond@yahoo.cm">quaysondesmond@yahoo.cm</a>
        </p>
        <p className="footer-copyright">© {new Date().getFullYear()} MathNexa</p>
      </Container>
    </footer>
  );
}

export async function SiteFooter() {
  const publicProduction = isProductionPublicMode();
  const productionPlatform = isProductionPlatformMode();
  const managed=productionPlatform?await loadPublishedCmsDocument("footer"):null;const allowed=new Map([["/privacy","Privacy"],["/accessibility","Accessibility"],["/terms","Terms"],["/cancellation","Cancellation"],["/refunds","Refunds"],["/support","Support"],["/play","Game access"]]);for(const block of managed?.content.blocks??[])for(const item of block.items??[])if(item.href&&allowed.has(item.href))allowed.set(item.href,item.title);
  if (productionPlatform) return <PlatformFooter legalLabels={allowed} />;
  return (
    <footer className="site-footer">
      <Container className="footer-inner">
        <p>{publicProduction ? "MathNexa provides public math-vocabulary resources without accounts or student data." : "Platform preview. The current classroom game remains the active experience."}</p>
        <div className="footer-links">
          <Link href={publicProduction ? "/privacy" : "/pilot/privacy"}>{publicProduction ? "Privacy" : "Pilot privacy"}</Link>
          {publicProduction ? <Link href="/accessibility">Accessibility</Link> : null}
          <Link href="/play">Go to the game gateway</Link>
        </div>
      </Container>
    </footer>
  );
}
