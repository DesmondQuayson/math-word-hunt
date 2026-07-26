import type { ReactNode } from "react";

import { Container } from "./container";
import { NavigationItem } from "./navigation-item";

const teacherNavigation = [
  { href: "/teacher", label: "Overview" },
  { href: "/teacher/classes", label: "Classes" },
  { href: "/teacher/reports", label: "Reports" }
] as const;

type TeacherShellProps = Readonly<{
  children: ReactNode;
  currentPath: string;
}>;

export function TeacherShell({ children, currentPath }: TeacherShellProps) {
  return (
    <Container className="page-stack">
      <nav className="teacher-nav" aria-label="Teacher workspace">
        <span className="teacher-nav-label">Workspace preview</span>
        <ul>
          {teacherNavigation.map((item) => (
            <li key={item.href}>
              <NavigationItem
                href={item.href}
                label={item.label}
                current={currentPath === item.href}
              />
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </Container>
  );
}
