import type { ReactNode } from "react";

import { Stack } from "./stack";

type PageHeaderProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}>;

export function PageHeader({
  eyebrow,
  title,
  description,
  children
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <Stack space="compact">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </Stack>
    </header>
  );
}
