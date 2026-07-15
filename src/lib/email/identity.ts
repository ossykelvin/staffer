import "server-only";

import { publicEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/email/provider";

type SignupWelcomeInput = {
  email: string;
  appUrl: string;
};

type OrganisationWelcomeInput = {
  email: string;
  appUrl: string;
  organisationName: string;
};

function appName() {
  return publicEnv.NEXT_PUBLIC_APP_NAME;
}

function companyName() {
  return publicEnv.NEXT_PUBLIC_COMPANY_NAME;
}

function normaliseAppUrl(value: string) {
  return value.replace(/\/$/, "");
}

export async function sendSignupWelcomeEmail(input: SignupWelcomeInput) {
  const baseUrl = normaliseAppUrl(publicEnv.NEXT_PUBLIC_APP_URL || input.appUrl);
  const subject = `Welcome to ${appName()} — confirm your email`;
  const textContent = `Welcome to ${appName()}.

Your founder account request for ${companyName()} has been received.

Next step:
Use the separate confirmation email from ${appName()} to verify your address. After confirmation, you can create your organisation and enter the governed Staffer workspace.

Sign in page:
${baseUrl}/login

If you did not request this account, you can ignore this email.

— ${appName()}`;

  return sendTransactionalEmail({
    to: [{ email: input.email }],
    subject,
    textContent,
    tags: ["staffer", "identity", "signup-welcome"],
    params: {
      lifecycle: "signup",
      appName: appName(),
    },
  });
}

export async function sendOrganisationWelcomeEmail(input: OrganisationWelcomeInput) {
  const baseUrl = normaliseAppUrl(publicEnv.NEXT_PUBLIC_APP_URL || input.appUrl);
  const subject = `${input.organisationName} is ready in ${appName()}`;
  const textContent = `Welcome to ${appName()}.

Your organisation, ${input.organisationName}, is ready.

You can now open the command centre, review your AI staff, create tasks, configure workflows and keep protected actions governed through approvals and audit.

Open ${appName()}:
${baseUrl}/

— ${appName()}`;

  return sendTransactionalEmail({
    to: [{ email: input.email }],
    subject,
    textContent,
    tags: ["staffer", "identity", "organisation-welcome"],
    params: {
      lifecycle: "organisation_onboarding",
      appName: appName(),
      organisationName: input.organisationName,
    },
  });
}
