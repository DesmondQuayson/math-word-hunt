import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "School Network Information",
  description:
    "Network and allowlist information for school and district IT: MathNexa is an HTTPS-only educational mathematics platform served from mathnexa.com."
};

// A stable public page district IT can inspect. Static content only — no
// auth, no data reads, no third-party assets, nothing that can fail.
export default function SchoolNetworkPage() {
  return (
    <div className="page-stack container" style={{ maxWidth: "48rem" }}>
      <header className="page-header">
        <p className="eyebrow">For school and district IT</p>
        <h1>MathNexa on school networks</h1>
        <p>
          MathNexa is a teacher-led mathematics platform: interactive math games, Missouri MAP
          preparation, printable homework, and topic quizzes.
        </p>
      </header>

      <section aria-labelledby="sn-domains">
        <h2 id="sn-domains">Required domains</h2>
        <ul>
          <li><strong>mathnexa.com</strong> — the site itself; every page and asset on first load is served from this single host.</li>
          <li><strong>www.mathnexa.com</strong> — permanent redirect to the above.</li>
          <li><strong>showme.mathnexa.com</strong> — the MAP Prep practice module (self-contained).</li>
        </ul>
        <p>
          Optional, for teacher account sign-in and subscription management only:{" "}
          <strong>*.supabase.co</strong>, <strong>checkout.stripe.com</strong>,{" "}
          <strong>billing.stripe.com</strong>.
        </p>
      </section>

      <section aria-labelledby="sn-technical">
        <h2 id="sn-technical">Technical profile</h2>
        <ul>
          <li>HTTPS only, standard TCP port 443. No special ports, no VPN, no UDP/QUIC requirement (HTTP/2 over TCP).</li>
          <li>Modern TLS with a publicly trusted certificate.</li>
          <li>The first page load contacts only mathnexa.com — no ads, trackers, analytics, or third-party scripts.</li>
          <li>No downloads are required to use the site; printable PDFs are teacher-initiated.</li>
          <li>Students do not need accounts, and general product use requires no student personal information.</li>
          <li>Connectivity test page: <a href="/network-check">mathnexa.com/network-check</a> (plain HTML, no JavaScript).</li>
        </ul>
      </section>

      <section aria-labelledby="sn-category">
        <h2 id="sn-category">Categorization</h2>
        <p>
          Appropriate web-filter category: <strong>Education / Educational Technology</strong>. The
          domain was registered in July 2026, so newly-registered-domain policies may affect it;
          allowlisting the domains above resolves that immediately.
        </p>
      </section>

      <section aria-labelledby="sn-contact">
        <h2 id="sn-contact">Contact</h2>
        <p>
          Owner: Desmond Quayson ·{" "}
          <a href="mailto:quaysondesmond@yahoo.com">quaysondesmond@yahoo.com</a>
        </p>
      </section>
    </div>
  );
}
