import type { ReactNode } from "react";

type StackSpace = "compact" | "standard" | "spacious";

type StackProps = Readonly<{
  children: ReactNode;
  space?: StackSpace;
  className?: string;
}>;

export function Stack({
  children,
  space = "standard",
  className = ""
}: StackProps) {
  return (
    <div className={`stack stack-${space} ${className}`.trim()}>{children}</div>
  );
}
