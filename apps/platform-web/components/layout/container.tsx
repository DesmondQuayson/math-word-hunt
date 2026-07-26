import type { ReactNode } from "react";

type ContainerWidth = "compact" | "standard" | "wide";

type ContainerProps = Readonly<{
  children: ReactNode;
  width?: ContainerWidth;
  className?: string;
}>;

export function Container({
  children,
  width = "standard",
  className = ""
}: ContainerProps) {
  return (
    <div className={`container container-${width} ${className}`.trim()}>
      {children}
    </div>
  );
}
