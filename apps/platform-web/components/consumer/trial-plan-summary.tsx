import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";

/**
 * Display values for the one approved MathNexa plan, derived from the
 * commercial policy (the same record the consent and Checkout path bind to)
 * so no price, currency, interval or trial length is restated by hand here.
 */
export function describeApprovedPlan(policy: Pick<typeof COMMERCIAL_POLICY, "amountMinorUnits" | "currency" | "interval" | "trialSeconds"> = COMMERCIAL_POLICY) {
  const currency = policy.currency.toUpperCase();
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(policy.amountMinorUnits / 100);
  const trialHours = policy.trialSeconds / 3600;
  return Object.freeze({
    price,
    currency,
    interval: policy.interval,
    intervalAdverb: policy.interval === "month" ? "monthly" : `every ${policy.interval}`,
    trialLabel: `${trialHours}-hour`
  });
}

function Check() {
  return <svg className="plan-fact-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>;
}

export function TrialPlanSummary({ headingLevel = 2 }: Readonly<{ headingLevel?: 2 | 3 }>) {
  const plan = describeApprovedPlan();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <section className="plan-summary" aria-labelledby="plan-summary-heading">
    <Heading className="form-section-title" id="plan-summary-heading">Plan</Heading>
    <div className="plan-summary-card">
      <div className="plan-summary-head">
        <p className="plan-summary-name">MathNexa monthly</p>
        <p className="plan-summary-price"><strong>{plan.price}</strong> <span>{plan.currency} / {plan.interval}</span></p>
      </div>
      <ul className="plan-facts">
        <li><Check /><span><strong>{plan.trialLabel} free trial</strong> with full access to Math Games, Online Math Prep, Homework PDFs, and Quiz PDFs.</span></li>
        <li><Check /><span>After the trial, {plan.price} {plan.currency} is billed {plan.intervalAdverb} and renews automatically until canceled.</span></li>
        <li><Check /><span>Cancel before the {plan.trialLabel} trial ends and you won&apos;t be charged.</span></li>
      </ul>
    </div>
  </section>;
}
