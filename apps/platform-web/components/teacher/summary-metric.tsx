type SummaryMetricProps = Readonly<{
  label: string;
  value: string | number;
  detail?: string;
}>;

export function SummaryMetric({ label, value, detail }: SummaryMetricProps) {
  return (
    <div className="summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
