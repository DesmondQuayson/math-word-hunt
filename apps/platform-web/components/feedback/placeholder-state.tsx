import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

type PlaceholderStateProps = Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
}>;

export function PlaceholderState({
  title,
  description,
  action
}: PlaceholderStateProps) {
  return (
    <Card variant="muted" className="placeholder-state">
      <p className="eyebrow">Future capability</p>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </Card>
  );
}
