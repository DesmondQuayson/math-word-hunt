import { StatusBadge } from "@/components/ui/status-badge";
import type { PrototypeReportRow } from "@/lib/prototype/teacher-fixtures.server";

type ReportTableProps = Readonly<{
  rows: readonly PrototypeReportRow[];
}>;

export function ReportTable({ rows }: ReportTableProps) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <caption>Demonstration lesson-level aggregate results</caption>
        <thead>
          <tr>
            <th scope="col">Lesson</th>
            <th scope="col">Sessions</th>
            <th scope="col">Teams</th>
            <th scope="col">Correct responses</th>
            <th scope="col">Review category</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.lesson}>
              <th scope="row">{row.lesson}</th>
              <td data-label="Sessions">{row.sessions}</td>
              <td data-label="Teams">{row.teams}</td>
              <td data-label="Correct responses">{row.correctPercent}%</td>
              <td data-label="Review category">
                <StatusBadge tone={row.reviewCategory === "Ready to revisit" ? "warning" : "information"}>
                  {row.reviewCategory}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
