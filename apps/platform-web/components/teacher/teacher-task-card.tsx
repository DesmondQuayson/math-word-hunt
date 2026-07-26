import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

type TeacherTaskCardProps = Readonly<{
  marker: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  current?: boolean;
}>;

export function TeacherTaskCard({
  marker,
  title,
  description,
  href,
  actionLabel,
  current = false
}: TeacherTaskCardProps) {
  return (
    <article>
      <Card variant={current ? "highlighted" : "interactive"} className="teacher-task-card">
        <span className="workspace-symbol" aria-hidden="true">{marker}</span>
        <h3>{title}</h3>
        <p>{description}</p>
        <LinkButton href={href} variant={current ? "primary" : "secondary"}>
          {actionLabel}
        </LinkButton>
      </Card>
    </article>
  );
}
