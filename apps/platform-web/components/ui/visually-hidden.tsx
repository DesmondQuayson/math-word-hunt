import type { ReactNode } from "react";

type VisuallyHiddenProps = Readonly<{
  children: ReactNode;
}>;

export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return <span className="visually-hidden">{children}</span>;
}
