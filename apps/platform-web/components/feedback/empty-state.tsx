import type { ReactNode } from "react";

type EmptyStateProps = Readonly<{
  title: string;
  description: string;
  symbol: string;
  headingId: string;
  action?: ReactNode;
}>;

export function EmptyState({
  title,
  description,
  symbol,
  headingId,
  action
}: EmptyStateProps) {
  return (
    <section className="empty-state" aria-labelledby={headingId}>
      <span className="empty-state-mark" aria-hidden="true">
        {symbol}
      </span>
      <h2 id={headingId}>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
