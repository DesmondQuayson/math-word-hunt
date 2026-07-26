import type { ReactNode } from "react";

type ClusterProps = Readonly<{
  children: ReactNode;
  className?: string;
}>;

export function Cluster({ children, className = "" }: ClusterProps) {
  return <div className={`cluster ${className}`.trim()}>{children}</div>;
}
