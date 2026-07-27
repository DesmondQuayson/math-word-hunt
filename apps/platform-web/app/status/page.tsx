import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/layout/container";
import { Notice } from "@/components/feedback/notice";
import { getPublicEnvironmentView, getServerEnvironment } from "@/lib/environment/server";
export const metadata = { title: "Preview status" };
export default function StatusPage() {
  const view=getPublicEnvironmentView(); const configured=getServerEnvironment() !== null;
  return <Container width="compact" className="page-stack operational-status"><PageHeader eyebrow="Operational boundary" title="Preview status" description="A minimal, non-sensitive readiness view for the controlled teacher pilot." />
    {view.operationalStatusVisible ? <Notice label="Preview readiness" tone={configured?"success":"warning"}><strong>{configured?"Local checks ready":"Configuration required"}</strong><p>{configured?"The server-owned preview contract is valid. This does not claim hosted providers are available.":"Sensitive operations remain denied until the server configuration is valid."}</p></Notice> : <Notice label="Status unavailable" tone="information"><strong>No preview details</strong><p>Operational details are available only in an explicitly configured preview environment.</p></Notice>}
    <dl className="definition-grid"><div><dt>Environment</dt><dd>{view.identity}</dd></div><div><dt>Build</dt><dd>{view.buildId}</dd></div><div><dt>Search indexing</dt><dd>Blocked</dd></div><div><dt>Live payments</dt><dd>Disabled</dd></div></dl>
  </Container>;
}
