import "server-only";

import { parseAuthEmailDeliveryState, type AuthEmailDeliveryState } from "@math-vocabulary-hunt/platform-core";

export type AuthEmailExperience = Readonly<{
  state: AuthEmailDeliveryState;
  tone: "information" | "warning" | "success";
  title: string;
  description: string;
  signUpResponse: string;
  recoveryResponse: string;
}>;
export type AuthEmailAudience = "teacher" | "consumer";

const copy: Record<AuthEmailDeliveryState, AuthEmailExperience> = {
  disabled: {
    state: "disabled", tone: "warning", title: "Confirmation and recovery delivery are unavailable.",
    description: "Do not rely on email delivery. Pilot access remains inactive until transactional Auth email is configured and verified.",
    signUpResponse: "Account request received. Confirmation delivery is currently unavailable.",
    recoveryResponse: "If that teacher account exists, the recovery request was accepted. External delivery is currently unavailable."
  },
  "local-capture": {
    state: "local-capture", tone: "information", title: "Messages are captured locally for testing only.",
    description: "No message is delivered to an external inbox. Use the local capture service only with synthetic accounts.",
    signUpResponse: "Check the local email inbox to verify the address before signing in.",
    recoveryResponse: "If that teacher account exists, a recovery message is available in the local email inbox."
  },
  "transactional-configured": {
    state: "transactional-configured", tone: "warning", title: "Transactional Auth email is configured but not verified.",
    description: "Confirmation and recovery delivery are still verification-pending. Real participant invitations remain blocked.",
    signUpResponse: "Account request received. Confirmation delivery is still being verified.",
    recoveryResponse: "If that teacher account exists, the recovery request was accepted. Delivery is still being verified."
  },
  "transactional-verified": {
    state: "transactional-verified", tone: "success", title: "Confirmation and recovery delivery are verified.",
    description: "Check your inbox for the requested Auth message. Links return only to the protected Math Vocabulary Hunt Preview.",
    signUpResponse: "Account request received. Check your inbox for the confirmation message before signing in.",
    recoveryResponse: "If that teacher account exists, a recovery message has been requested. Check your inbox."
  }
};

export function getAuthEmailExperience(
  source: Readonly<Record<string, string | undefined>> = process.env,
  audience: AuthEmailAudience = "teacher"
): AuthEmailExperience {
  const experience = copy[parseAuthEmailDeliveryState(source.MVH_EMAIL_DELIVERY) ?? "disabled"];
  if (audience === "teacher") return experience;
  return Object.freeze({
    ...experience,
    description: experience.description
      .replace("Pilot access", "Account access")
      .replace("Real participant invitations", "Production account activation")
      .replace("the protected Math Vocabulary Hunt Preview", "the approved MathNexa account origin"),
    recoveryResponse: experience.recoveryResponse.replace("that teacher account", "that account")
  });
}
