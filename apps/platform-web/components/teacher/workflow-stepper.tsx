type WorkflowStep = Readonly<{
  label: string;
  description: string;
}>;

type WorkflowStepperProps = Readonly<{
  steps: readonly WorkflowStep[];
  currentStep: number;
  label: string;
}>;

export function WorkflowStepper({
  steps,
  currentStep,
  label
}: WorkflowStepperProps) {
  return (
    <ol className="workflow-stepper" aria-label={label}>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const state = stepNumber < currentStep
            ? "complete"
            : stepNumber === currentStep
              ? "current"
              : "upcoming";
          return (
            <li key={step.label} data-step-state={state}>
              <span className="workflow-step-number" aria-hidden="true">
                {state === "complete" ? "✓" : stepNumber}
              </span>
              <span>
                <strong>{step.label}</strong>
                <small>{step.description}</small>
              </span>
              {state === "current" ? <span className="visually-hidden">Current step</span> : null}
            </li>
          );
        })}
    </ol>
  );
}
