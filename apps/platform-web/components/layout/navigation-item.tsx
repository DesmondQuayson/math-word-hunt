import Link from "next/link";

type NavigationItemProps = Readonly<{
  href: string;
  label: string;
  current?: boolean;
}>;

export function NavigationItem({
  href,
  label,
  current = false
}: NavigationItemProps) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {label}
    </Link>
  );
}
