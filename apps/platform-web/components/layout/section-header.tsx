type SectionHeaderProps = Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  id: string;
  compact?: boolean;
  className?: string;
}>;

export function SectionHeader({
  eyebrow,
  title,
  description,
  id,
  compact = false,
  className = ""
}: SectionHeaderProps) {
  return (
    <header
      className={`section-header ${compact ? "section-header-compact" : ""} ${className}`.trim()}
    >
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 id={id}>{title}</h2>
      {description ? <p className="section-description">{description}</p> : null}
    </header>
  );
}
