import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";

/**
 * The confirmation a customer keeps after starting a MathNexa subscription:
 * the automatic-renewal terms they agreed to, the trial's exact end, when and
 * how much is charged, how to cancel (and that canceling before the trial ends
 * costs nothing), the policy versions, and how to reach us. The refund-review
 * rule appears only in the paid-subscription email (a charge was made today);
 * the free-trial email leaves it out (owner, 2026-11-22). The refund policy
 * itself lives in the Subscription Terms and is unchanged.
 * Plain text plus simple HTML; every value is escaped; no ids or secrets.
 */

export type ConfirmationKind = "trial" | "subscription";

export type SubscriptionConfirmationInput = Readonly<{
  kind: ConfirmationKind;
  /** When the trial (or the paid subscription) started, ISO. */
  startedAt: string;
  /** When the trial ends and the first charge is due, ISO; null for a subscription without a trial. */
  trialEndsAt: string | null;
  /** Exact application origin, for example https://mathnexa.com. */
  applicationOrigin: string;
  supportEmail: string | null;
}>;

export type SubscriptionConfirmation = Readonly<{ subject: string; text: string; html: string }>;

const US_ZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Los_Angeles", "Pacific"]
] as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

/** "Mon, Nov 23, 2026, 3:14 PM CST" in US Central time. */
export function centralDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
  }).format(new Date(iso));
}

/** "4:14 PM EST · 3:14 PM CST · 2:14 PM MST · 1:14 PM PST", the same moment in the four mainland US time zones. */
export function usTimes(iso: string): string {
  return US_ZONES.map(([timeZone]) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso))).join(" · ");
}

export function ordinalDay(iso: string): string {
  const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", day: "numeric" }).format(new Date(iso)));
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

function validIso(value: string | null): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function renderSubscriptionConfirmation(input: SubscriptionConfirmationInput): SubscriptionConfirmation | null {
  let origin: URL;
  try {
    origin = new URL(input.applicationOrigin);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(origin.protocol) || origin.origin !== input.applicationOrigin.replace(/\/$/, "")) return null;
  if (!validIso(input.startedAt)) return null;
  if (input.kind === "trial" && !validIso(input.trialEndsAt)) return null;
  const support = input.supportEmail && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(input.supportEmail) ? input.supportEmail : null;

  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: COMMERCIAL_POLICY.currency.toUpperCase() }).format(COMMERCIAL_POLICY.amountMinorUnits / 100);
  const amount = `${price} ${COMMERCIAL_POLICY.currency.toUpperCase()}`;
  const trialHours = COMMERCIAL_POLICY.trialSeconds / 3600;
  const subscriptionUrl = `${origin.origin}/subscription`;
  const termsUrl = `${origin.origin}/terms`;
  const privacyUrl = `${origin.origin}/privacy`;
  const supportUrl = `${origin.origin}/support`;
  const started = centralDateTime(input.startedAt);
  const billingDay = ordinalDay(input.kind === "trial" ? input.trialEndsAt! : input.startedAt);

  const sections: Array<readonly [string, readonly string[]]> = [];
  let subject: string;
  let opening: string[];
  if (input.kind === "trial") {
    const ends = centralDateTime(input.trialEndsAt!);
    subject = "Your MathNexa free trial has started";
    opening = [
      `Your ${trialHours}-hour MathNexa free trial has started.`,
      `Trial started: ${started}`,
      `Trial ends: ${ends}`,
      `(That is ${usTimes(input.trialEndsAt!)}.)`
    ];
    sections.push(
      ["What happens next", [
        `When the trial ends, your card is charged ${amount}, then ${amount} every month on or about the ${billingDay}, automatically, until you cancel. There is no minimum term. Stripe sets the exact minute of each charge.`
      ]],
      ["How to cancel", [
        `To pay nothing, cancel before ${ends}: open ${subscriptionUrl} and choose "Manage or cancel in Stripe".`,
        "You can cancel at any time. After a charge, canceling stops future charges and your access continues to the end of the month you paid for."
      ]]
    );
  } else {
    subject = "Your MathNexa subscription has started";
    opening = [
      "Your MathNexa subscription has started.",
      `Started: ${started}`
    ];
    sections.push(
      ["What happens next", [
        `Your card was charged ${amount} today and will be charged ${amount} every month on or about the ${billingDay}, automatically, until you cancel. There is no minimum term. Your account has already used its free trial.`
      ]],
      ["How to cancel", [
        `Open ${subscriptionUrl} and choose "Manage or cancel in Stripe". You can cancel at any time; canceling stops future charges and your access continues to the end of the month you paid for.`
      ]],
      ["Refunds", [
        "Ask within seven days of your first charge and we review a refund by hand. Refunds are not automatic or guaranteed."
      ]]
    );
  }
  sections.push(
    ["What you agreed to", [
      `The automatic renewal terms above, the MathNexa Subscription Terms (version ${COMMERCIAL_POLICY.termsVersion}) including the cancellation and refund policies, and the Privacy Notice (version ${COMMERCIAL_POLICY.privacyVersion}).`,
      `Subscription Terms: ${termsUrl}`,
      `Privacy Notice: ${privacyUrl}`
    ]],
    ["Questions", [
      support ? `Visit ${supportUrl} or write to ${support}.` : `Visit ${supportUrl}.`
    ]]
  );
  const footer = `MathNexa · ${origin.host}. This is a transactional message about the subscription you started; it is not marketing.`;

  const text = [
    opening.join("\n"),
    ...sections.map(([title, lines]) => `${title}\n${lines.map((line) => `- ${line}`).join("\n")}`),
    footer
  ].join("\n\n") + "\n";

  const linkify = (value: string) => escapeHtml(value)
    .replace(escapeHtml(subscriptionUrl), `<a href="${escapeHtml(subscriptionUrl)}">${escapeHtml(subscriptionUrl)}</a>`)
    .replace(escapeHtml(termsUrl), `<a href="${escapeHtml(termsUrl)}">${escapeHtml(termsUrl)}</a>`)
    .replace(escapeHtml(privacyUrl), `<a href="${escapeHtml(privacyUrl)}">${escapeHtml(privacyUrl)}</a>`)
    .replace(escapeHtml(supportUrl), `<a href="${escapeHtml(supportUrl)}">${escapeHtml(supportUrl)}</a>`);
  const html = [
    "<!doctype html><html lang=\"en\"><body style=\"margin:0;padding:24px;background:#f6f8fb;color:#0d1b2a;font:16px/1.5 Arial,sans-serif\">",
    "<div style=\"max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d8dee8;border-radius:10px;padding:24px\">",
    `<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(opening[0]!)}</h1>`,
    ...opening.slice(1).map((line) => `<p style="margin:4px 0">${escapeHtml(line)}</p>`),
    ...sections.map(([title, lines]) => `<h2 style="font-size:17px;margin:20px 0 6px">${escapeHtml(title)}</h2><ul style="margin:0;padding-left:20px">${lines.map((line) => `<li style="margin:4px 0">${linkify(line)}</li>`).join("")}</ul>`),
    `<p style="margin:24px 0 0;font-size:13px;color:#4f5d6e">${escapeHtml(footer)}</p>`,
    "</div></body></html>"
  ].join("");
  return Object.freeze({ subject, text, html });
}
