import { StatusBadge } from "@/components/ui/status-badge";
import type { CurriculumStatusKey } from "@/lib/adapters/curriculum-summary";

const statusDetails: Record<
  CurriculumStatusKey,
  Readonly<{ label: string; tone: "success" | "warning" | "neutral" | "information" }>
> = {
  ready: { label: "Ready", tone: "success" },
  thin: { label: "Thin—Combine Mode recommended", tone: "warning" },
  "coming-soon": { label: "Coming soon", tone: "neutral" },
  "review-pending": { label: "Teacher review pending", tone: "information" }
};

type CurriculumStatusProps = Readonly<{
  status: CurriculumStatusKey;
}>;

export function CurriculumStatus({ status }: CurriculumStatusProps) {
  const detail = statusDetails[status];
  return <StatusBadge tone={detail.tone}>{detail.label}</StatusBadge>;
}
