import type { ReactNode } from "react";

import { Container } from "./container";
import { NavigationItem } from "./navigation-item";

const teacherNavigation = [
  { href: "/teacher", label: "Overview" },
  { href: "/teacher/classes", label: "Classes" },
  { href: "/teacher/activities", label: "Activities" },
  { href: "/teacher/sessions", label: "Live Sessions" },
  { href: "/teacher/reports", label: "Reports" },
  { href: "/teacher/curriculum", label: "Curriculum" },
  { href: "/account", label: "Account" }
] as const;

type TeacherShellProps = Readonly<{
  children: ReactNode;
  currentPath: string;
}>;

function isCurrentPath(currentPath: string, itemPath: string): boolean {
  if (itemPath === "/teacher") return currentPath === itemPath;
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function TeacherShell({ children, currentPath }: TeacherShellProps) {
  return (
    <Container width="wide" className="page-stack teacher-shell">
      <div className="teacher-shell-layout">
        <aside className="teacher-rail" aria-label="Teacher workflow map">
          <div className="teacher-rail-heading">
            <p className="teacher-nav-label">Teacher field map</p>
            <p>Plan → play → review</p>
          </div>
          <nav className="teacher-workspace-nav" aria-label="Teacher workspace">
            <ul>
              {teacherNavigation.map((item) => (
                <li key={item.href}>
                  <NavigationItem
                    href={item.href}
                    label={item.label}
                    current={isCurrentPath(currentPath, item.href)}
                  />
                </li>
              ))}
            </ul>
          </nav>
          <p className="teacher-rail-note">
            Preview only. Accounts, saving, and managed live sessions are not
            available.
          </p>
        </aside>
        <div className="teacher-main">{children}</div>
      </div>
    </Container>
  );
}
