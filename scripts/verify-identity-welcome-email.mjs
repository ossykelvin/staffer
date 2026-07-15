import { existsSync, readFileSync } from "node:fs";

const files = [
  "src/lib/email/identity.ts",
  "src/lib/observability/log.ts",
  "src/app/login/actions.ts",
  "src/app/onboarding/actions.ts",
  "src/app/page.tsx",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing identity welcome file: ${file}`);
  }
}

const identityEmail = readFileSync("src/lib/email/identity.ts", "utf8");
for (const phrase of [
  'import "server-only"',
  "sendSignupWelcomeEmail",
  "sendOrganisationWelcomeEmail",
  "sendTransactionalEmail",
  "signup-welcome",
  "organisation-welcome",
]) {
  if (!identityEmail.includes(phrase)) {
    throw new Error(`Missing identity email phrase: ${phrase}`);
  }
}

const observability = readFileSync("src/lib/observability/log.ts", "utf8");
for (const phrase of ["logStructured", "maskEmail", "emailDomain", "console.error", "console.warn", "console.log"]) {
  if (!observability.includes(phrase)) {
    throw new Error(`Missing observability phrase: ${phrase}`);
  }
}

const loginActions = readFileSync("src/app/login/actions.ts", "utf8");
for (const phrase of [
  "auth.signup.started",
  "auth.signup.failed",
  "auth.signup.created",
  "auth.signup_welcome_email.sent",
  "auth.signup_welcome_email.failed",
  "sendSignupWelcomeEmail",
  "maskEmail",
]) {
  if (!loginActions.includes(phrase)) {
    throw new Error(`Missing signup welcome phrase: ${phrase}`);
  }
}

const onboardingActions = readFileSync("src/app/onboarding/actions.ts", "utf8");
for (const phrase of [
  "identity.onboarding.started",
  "identity.onboarding.failed",
  "identity.organisation_welcome_email.sent",
  "identity.organisation_welcome_email.failed",
  "identity.organisation_welcome_email_sent",
  "identity.organisation_welcome_email_failed",
  "sendOrganisationWelcomeEmail",
  "recordAuditEvent",
]) {
  if (!onboardingActions.includes(phrase)) {
    throw new Error(`Missing onboarding welcome phrase: ${phrase}`);
  }
}

const homePage = readFileSync("src/app/page.tsx", "utf8");
for (const phrase of ["searchParams", "params.message", "params.error"]) {
  if (!homePage.includes(phrase)) {
    throw new Error(`Missing dashboard feedback phrase: ${phrase}`);
  }
}

console.log("Identity welcome email static verification passed.");
