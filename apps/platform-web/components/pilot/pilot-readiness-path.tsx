const steps = [
  { label: "Understand", detail: "Know the restricted purpose." },
  { label: "Safeguard", detail: "Keep student data out." },
  { label: "Evaluate", detail: "Test only supported workflows." },
  { label: "Exit", detail: "Log out and request restriction." }
] as const;

export function PilotReadinessPath() {
  return (
    <ol className="pilot-readiness-path" aria-label="Pilot participation path">
      {steps.map((step, index) => (
        <li key={step.label}>
          <span aria-hidden="true">{index + 1}</span>
          <div><strong>{step.label}</strong><small>{step.detail}</small></div>
        </li>
      ))}
    </ol>
  );
}
