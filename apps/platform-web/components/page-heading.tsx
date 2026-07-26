import type { ReactNode } from "react";

type PageHeadingProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}>;

export function PageHeading({
  eyebrow,
  title,
  description,
  children
}: PageHeadingProps) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{description}</p>
      {children}
    </header>
  );
}
