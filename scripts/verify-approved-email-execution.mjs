import { existsSync, readFileSync } from "node:fs";

const files = [
  "supabase/migrations/20260715224930_phase9_approved_brevo_execution.sql",
  "src/app/approvals/[id]/actions.ts",
  "src/app/approvals/[id]/page.tsx",
  "src/lib/email/provider.ts",
];

for (const file of files) {
  if (!existsSync(file)) {
    throw new Error(`Missing approved email execution file: ${file}`);
  }
}

const migration = readFileSync("supabase/migrations/20260715224930_phase9_approved_brevo_execution.sql", "utf8");
for (const phrase of ["support_triage_cases_external_action_status_check", "'sent'", "approval-gated Brevo send completion"]) {
  if (!migration.includes(phrase)) {
    throw new Error(`Missing approved email execution migration phrase: ${phrase}`);
  }
}

const actions = readFileSync("src/app/approvals/[id]/actions.ts", "utf8");
for (const phrase of [
  "sendApprovedSupportEmailAction",
  "support.response_draft",
  "verify_approval_execution",
  "sendTransactionalEmail",
  "execution_status: \"executed\"",
  "external_action_status: \"sent\"",
  "support_triage.email_sent",
  "support_triage.email_failed",
]) {
  if (!actions.includes(phrase)) {
    throw new Error(`Missing approved email execution action phrase: ${phrase}`);
  }
}

const page = readFileSync("src/app/approvals/[id]/page.tsx", "utf8");
for (const phrase of ["sendApprovedSupportEmailAction", "Approved Brevo email execution", "Execute approved Brevo email", "blocks duplicate sends"]) {
  if (!page.includes(phrase)) {
    throw new Error(`Missing approved email execution UI phrase: ${phrase}`);
  }
}

console.log("Approved email execution static verification passed.");
