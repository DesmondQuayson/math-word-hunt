import Link from "next/link";

const navigation = [
  { href: "/play", label: "Play" },
  { href: "/teacher", label: "Teacher" },
  { href: "/account", label: "Account" }
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Math Vocabulary Hunt home">
          <span className="brand-mark" aria-hidden="true">
            x+y
          </span>
          <span className="brand-name">
            Math Vocabulary <strong>Hunt</strong>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <ul className="nav-list">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
