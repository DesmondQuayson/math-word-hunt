import { Container } from "@/components/layout/container";

/**
 * The instant response to a product click. Rendered by each protected route's
 * `loading.tsx`, so the App Router paints it the moment a Link is activated —
 * before the server has resolved the session, the entitlement and the page
 * data. It is deliberately tiny: a status line in the page's own container, no
 * spinner theatre, no full-screen overlay, and it is announced politely to
 * assistive technology. It never replaces the real work of making the route
 * fast; it only removes the "did my click register?" gap.
 */
export function RouteOpening({ label, width = "wide" }: Readonly<{ label: string; width?: "wide" | "compact" }>) {
  return <Container className="page-stack route-opening" width={width}>
    <p className="route-opening-status" role="status" aria-live="polite">Opening {label}<span aria-hidden="true">…</span></p>
    <div className="route-opening-bar" aria-hidden="true" />
  </Container>;
}
