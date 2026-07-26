type SkipLinkProps = Readonly<{
  targetId?: string;
}>;

export function SkipLink({ targetId = "main-content" }: SkipLinkProps) {
  return (
    <a className="skip-link" href={`#${targetId}`}>
      Skip to main content
    </a>
  );
}
