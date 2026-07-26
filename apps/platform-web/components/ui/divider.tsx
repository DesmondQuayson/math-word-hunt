type DividerProps = Readonly<{
  className?: string;
}>;

export function Divider({ className = "" }: DividerProps) {
  return <hr className={`divider ${className}`.trim()} />;
}
