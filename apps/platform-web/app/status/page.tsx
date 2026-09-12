import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/layout/container";
import { Notice } from "@/components/feedback/notice";
import { getOperationalStatus } from "@/lib/environment/operational-status";

export const metadata = { title: "Status" };

/**
 * The page reports RUNTIME capability, so it must never be prerendered with
 * build-time values (production bug sweep BS-02).
 */
export const dynamic = "force-dynamic";

const PLATFORM_COPY = { operational: "Operational", "configuration-required": "Configuration required" } as const;
const SEARCH_COPY = { enabled: "Enabled", blocked: "Blocked", unknown: "Unable to verify" } as const;
const PAYMENT_COPY = { live: "Enabled", test: "Test mode", unavailable: "Disabled", unknown: "Unable to verify" } as const;
const ENVIRONMENT_COPY = { production: "Production", staging: "Staging", development: "Development", unknown: "Unable to verify" } as const;

export default function StatusPage() {
  const status = getOperationalStatus();
  const operational = status.platform === "operational";
  return (
    <Container width="compact" className="page-stack operational-status">
      <PageHeader
        eyebrow="Service status"
        title="MathNexa status"
        description="A short, non-sensitive view of what this site can do right now."
      />
      <Notice label="Platform readiness" tone={operational ? "success" : "warning"}>
        <strong>{PLATFORM_COPY[status.platform]}</strong>
        <p>
          {operational
            ? "The site is serving its published configuration. Search indexing reports crawl permission, not whether a search engine has indexed a page yet."
            : "Sensitive operations remain denied until the server configuration is valid."}
        </p>
      </Notice>
      <dl className="definition-grid">
        <div>
          <dt>Platform</dt>
          <dd>{PLATFORM_COPY[status.platform]}</dd>
        </div>
        <div>
          <dt>Search indexing</dt>
          <dd>{SEARCH_COPY[status.searchIndexing]}</dd>
        </div>
        <div>
          <dt>Live payments</dt>
          <dd>{PAYMENT_COPY[status.payments]}</dd>
        </div>
        {status.environment === "production" ? null : (
          <div>
            <dt>Environment</dt>
            <dd>{ENVIRONMENT_COPY[status.environment]}</dd>
          </div>
        )}
      </dl>
    </Container>
  );
}
