import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

export function PublicPricingPage() {
  return (
    <Container className="page-stack">
      <PageHeader
        eyebrow="Current public access"
        title="MathNexa pricing"
        description="The current public release keeps the working Math Vocabulary Hunt available without an account or payment."
      />
      <Notice label="Subscriptions unavailable" tone="information">
        <strong>No paid plan can be purchased on this release.</strong>
        <p>Account creation, payment collection, Checkout, subscription management, and automatic billing remain disabled.</p>
      </Notice>
      <Card>
        <p className="card-kicker">Available now</p>
        <h2>Public game access</h2>
        <p>Open the browser-based math learning game, choose an available grade and lesson, and play without entering payment information.</p>
      </Card>
      <div className="button-row">
        <LinkButton href="/play">Open the game gateway</LinkButton>
        <LinkButton href="/help" variant="secondary">Read the game guide</LinkButton>
      </div>
    </Container>
  );
}
